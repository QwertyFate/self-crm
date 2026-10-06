// CLIENT (static) tests: a note composed on a deal is bound to that deal; the
// deal detail shows the contact's whole history BY DEFAULT ("all together")
// with a "This deal only" filter; the Activities page filters by deal.
//
//   deal detail    composes with deal_id = the deal. Its timeline loads
//                  ?contact_id= (every note on the contact, each labelled with
//                  the deal it was logged on) and, with "This deal only" on,
//                  ?deal_id= (this deal's notes PLUS the contact's notes not
//                  tied to any deal — only other deals' notes drop out). A deal
//                  with no contact can only have bound notes: always ?deal_id=.
//   contact detail composes WITHOUT a deal (a contact-level note); its timeline
//                  badges each bound note with its deal's title
//   Activities     a Deal filter chip that REFETCHES with ?deal_id= — same rule
//   the modal      a deal picker; choosing a deal fills an empty contact
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const dv = read('public/js/detail-views.js');
const objects = read('public/js/objects.js');
const modals = read('public/js/modals.js');
const html = read('public/index.html');
const core = read('public/js/core.js');
const dealDetail = sliceFn(dv, 'openDealDetail', 'detail-views.js');

describe('deal detail: composing', () => {
  test('a note composed on a deal is bound to it', () => {
    assert.match(sliceFn(dv, 'submitCompose', 'detail-views.js'), /api\.post\('\/api\/activities', \{ contact_id: c\.id, deal_id: S\.d\.id, type: S\.type/);
  });
});

describe('deal detail: the timeline shows everything by default, "This deal only" on demand', () => {
  test('the filter starts OFF — all together is the default', () => {
    assert.match(dv, /tab: 'overview', actsOnly: false, type: 'note'/);
  });
  test('loading: the whole contact history by default, this deal (plus contact-level notes) when the filter is on, and always ?deal_id= for a contact-less deal', () => {
    const la = dealDetail.match(/const loadActs = async \(\) => \{[\s\S]*?\n  \};/)[0];
    assert.match(la, /S\.actsOnly \|\| !S\.d\.contact_id \? `\/api\/activities\?deal_id=\$\{S\.d\.id\}` : `\/api\/activities\?contact_id=\$\{S\.d\.contact_id\}`/);
    assert.doesNotMatch(la, /\/api\/contacts\//);
  });
  test('the chip reads "This deal only" when off and "Show all notes" when on — it names what clicking it does next', () => {
    const ah = sliceFn(dv, 'activityHtml', 'detail-views.js');
    assert.match(ah, /<button class="chip \$\{S\.actsOnly \? 'on' : ''\}" data-act="tlonly" type="button" aria-pressed="\$\{S\.actsOnly\}" title="\$\{S\.actsOnly \? '[^']*' : 'Notes logged on this deal, plus notes on the contact not tied to any deal'\}">\$\{S\.actsOnly \? 'Show all notes' : 'This deal only'\}<\/button>/);
    assert.match(ah, /title="\$\{S\.actsOnly \? 'Showing notes on this deal and untied contact notes\. Click to show every note on the contact\.'/);
  });
  test('toggling the chip flips the flag, reloads from the server, and re-renders', () => {
    assert.match(dealDetail, /on\(root, 'click', '\[data-act="tlonly"\]', async \(\) => \{ S\.actsOnly = !S\.actsOnly; await loadActs\(\); render\('head main'\); \}\)/);
  });
  test('in the "all together" view a note bound to ANOTHER deal of the contact is labelled with that deal', () => {
    assert.match(dealDetail, /a\.bound_deal_id && a\.bound_deal_id !== S\.d\.id \? `<span class="badge badge-outline"[^`]*\$\{esc\(a\.deal_title \|\| 'Other deal'\)\}<\/span>` : ''/);
  });
});

describe('contact detail', () => {
  test('a note logged on a contact carries NO deal — it is about the contact', () => {
    assert.match(sliceFn(dv, 'logActivity', 'detail-views.js'), /api\.post\('\/api\/activities', \{ contact_id: id, type: d\.type, content/);
    assert.doesNotMatch(sliceFn(dv, 'logActivity', 'detail-views.js'), /deal_id/);
  });
  test('the timeline badges a bound note with its deal\'s title', () => {
    const item = dv.match(/const actItem = a => \{[\s\S]*?\n  \};/)[0];
    assert.match(item, /a\.deal_title \? `<span class="badge badge-outline"[^`]*\$\{esc\(a\.deal_title\)\}<\/span>` : ''/);
  });
});

describe('Activities page: a Deal filter through the server', () => {
  test('filter state has a deal slot; clearing resets it', () => {
    assert.match(objects, /^let activitiesUI = \{ q: '', type: null, by: null, deal: null \};/m);
    assert.match(sliceFn(objects, 'clearActivitiesFilters', 'objects.js'), /deal: null/);
  });
  test('loading refetches with ?deal_id= when a deal is chosen', () => {
    const la = sliceFn(objects, 'loadActivities', 'objects.js');
    assert.match(la, /activitiesUI\.deal \? `\/api\/activities\?deal_id=\$\{activitiesUI\.deal\}` : '\/api\/activities'/);
  });
  test('the toolbar has a Deal chip, labelled from the deals that actually have notes', () => {
    assert.match(sliceFn(objects, 'renderActivitiesToolbar', 'objects.js'), /activitiesChip\('deal'/);
    assert.match(sliceFn(objects, 'activitiesChip', 'objects.js'), /key === 'deal'/);
  });
  test('choosing a deal refetches (the filter is server-side), other chips still filter locally', () => {
    const o = sliceFn(objects, 'openActivitiesChip', 'objects.js');
    assert.match(o, /key === 'deal'/);
    assert.match(o, /loadActivities\(\)/);
  });
  test('the deal options survive a filtered fetch (captured from the unfiltered list)', () => {
    assert.match(objects, /^let activityDeals = \[\];/m);
    assert.match(sliceFn(objects, 'loadActivities', 'objects.js'), /if \(!activitiesUI\.deal\) activityDeals = /);
  });
  test('"chip_deal" exists in both languages', () => {
    assert.match(core, /chip_person:'Person', chip_deal:'Deal'[\s\S]*chip_person:'Person', chip_deal:'Deal'/);
  });
});

describe('the activity modal', () => {
  test('has a Deal picker after the Contact', () => {
    assert.match(html, /<select id="act-contact"><\/select><\/div>\s*<div class="field"><label class="label" for="act-deal" data-i18n="lbl_deal">Deal<\/label><select id="act-deal"[^>]*><\/select><\/div>/);
    assert.match(core, /lbl_deal:'Deal'[\s\S]*lbl_deal:'Deal'/);
  });
  test('opening fills it from /api/deals and resets to "no deal"', () => {
    const o = sliceFn(modals, 'openActivityModal', 'modals.js');
    assert.match(o, /api\.get\('\/api\/deals'\)/);
    assert.match(o, /getElementById\('act-deal'\)\.innerHTML = '<option value="">/);
  });
  test('choosing a deal fills an empty contact from it', () => {
    assert.match(sliceFn(modals, 'onActivityDealChange', 'modals.js'), /if \(d\?\.contact_id && !c\.value\) c\.value = d\.contact_id/);
    assert.match(html, /<select id="act-deal" onchange="onActivityDealChange\(\)">/);
  });
  test('saving sends deal_id', () => {
    assert.match(sliceFn(modals, 'saveActivity', 'modals.js'), /deal_id:\s+document\.getElementById\('act-deal'\)\.value \|\| null/);
  });
});
