// CLIENT tests for the stage-triggered onboarding prompt: the pure decision
// helper in public/js/onboarding.js, and the wiring — settings card, save
// function, the two deal stage-change paths, and the confirmed start.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns, read, sliceFn } = require('../helpers/client-fn');

const F = loadFns('public/js/onboarding.js', ['shouldPromptOnboarding']);

describe('shouldPromptOnboarding(prev, next, triggerIds)', () => {
  test('asks only when a deal ENTERS the trigger set', () => {
    assert.equal(F.shouldPromptOnboarding(10, 30, [30, 31]), true);
    assert.equal(F.shouldPromptOnboarding(null, 30, [30]), true, 'new deal created in a trigger stage');
    assert.equal(F.shouldPromptOnboarding(30, 31, [30, 31]), false, 'moving between two trigger stages');
    assert.equal(F.shouldPromptOnboarding(30, 30, [30]), false, 'same stage re-saved');
    assert.equal(F.shouldPromptOnboarding(30, 10, [30]), false, 'leaving');
    assert.equal(F.shouldPromptOnboarding(10, null, [30]), false, 'stage cleared');
  });
  test('ids may arrive as strings; no config -> never', () => {
    assert.equal(F.shouldPromptOnboarding('10', '30', ['30']), true);
    assert.equal(F.shouldPromptOnboarding(10, 30, []), false);
    assert.equal(F.shouldPromptOnboarding(10, 30, undefined), false);
  });
});

describe('wiring', () => {
  const html = read('public/index.html'), settings = read('public/js/settings.js');
  test('settings card (Deals pane) with hint, stage list and save button', () => {
    const card = html.slice(html.indexOf('id="onboarding-trigger-card"'), html.indexOf('id="onboarding-trigger-msg"'));
    assert.ok(card.length > 0);
    assert.match(html, /<div class="settings-card hidden wide" id="onboarding-trigger-card"/);   // full-width card in the Deals pane (Part 47)
    for (const s of ['data-i18n="set_onboarding_trigger"', 'data-i18n="hint_onboarding_trigger"', 'id="onboarding-trigger-stages"', 'onclick="saveOnboardingTrigger()"']) assert.ok(card.includes(s), s);
  });
  test('the stage list is rendered with the pipelines and shown to owners; save PATCHes the workspace', () => {
    assert.match(sliceFn(settings, 'renderPipelinesSettings', 'settings.js'), /renderOnboardingTriggerSettings\(\)/);
    assert.match(sliceFn(settings, 'renderOnboardingTriggerSettings', 'settings.js'), /currentWorkspace\?\.onboarding_trigger_stage_ids/);
    assert.match(sliceFn(settings, 'loadSettings', 'settings.js'), /onboarding-trigger-card/);
    const save = sliceFn(settings, 'saveOnboardingTrigger', 'settings.js');
    assert.match(save, /api\.patch\('\/api\/workspace\/onboarding-trigger', \{ stage_ids \}\)/);
    assert.match(save, /currentWorkspace\.onboarding_trigger_stage_ids = res\.stage_ids/);
  });
  test('kanban drop remembers the previous stage before the optimistic update and asks after the PATCH', () => {
    const drop = sliceFn(read('public/js/deals.js'), 'dealDrop', 'deals.js');
    const iPrev = drop.indexOf('const prevStageId = deal.stage_id;'), iSet = drop.indexOf('deal.stage_id = stageId;'), iPatch = drop.indexOf('api.patch('), iAsk = drop.indexOf('maybePromptOnboarding(deal, prevStageId, stageId)');
    assert.ok(iPrev >= 0 && iSet > iPrev, 'previous stage captured before the overwrite');
    assert.ok(iPatch >= 0 && iAsk > iPatch, 'prompt after the server accepted the move');
  });
  test('the deal form asks too, with the pre-edit stage', () => {
    const save = sliceFn(read('public/js/modals.js'), 'saveDeal', 'modals.js');
    assert.match(save, /const prevStageId = /);
    assert.match(save, /maybePromptOnboarding\(/);
  });
  test('the prompt never re-asks an onboarded contact and starts without a second confirm', () => {
    const fn = sliceFn(read('public/js/onboarding.js'), 'maybePromptOnboarding', 'onboarding.js');
    assert.match(fn, /onboarding_status !== 'kein_onboarding'\) return/);
    assert.match(fn, /requestOnboardingStart\(contactId, c\.onboarding_status, \{ confirmed: true \}\)/);
    assert.match(sliceFn(read('public/js/contacts.js'), 'requestOnboardingStart', 'contacts.js'), /if \(!confirmed && !confirm\(msg\)\) return false;/);
  });
});
