// CLIENT (static + pure-function) tests: contacts have no stage. Stages belong
// to deals (pipeline stages); every contact-stage surface — card pill, form
// rows, table column, filters, Settings card, import/export, i18n, CSS — is
// gone, and the deal-side stage UI is untouched.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const css = read('public/style.css');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const modals = read('public/js/modals.js');
const contacts = read('public/js/contacts.js');
const settings = read('public/js/settings.js');
const admin = read('public/js/admin-import.js');
const allJs = ['core', 'auth', 'contacts', 'modals', 'settings', 'admin-import', 'deals', 'tasks', 'calendar', 'analytics', 'integrations', 'objects', 'guide', 'chat', 'notifications', 'clock']
  .map(f => read(`public/js/${f}.js`)).join('\n');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

describe('markup', () => {
  test('no contact stage in the contact form, no stage modal, no Settings card', () => {
    for (const s of ['cf-stage', 'id="stage-modal"', 'stage-form', 'contact-stages-list', 'set_contact_stages', 'hint_contact_stages', 'openStageModal']) {
      assert.equal(html.includes(s), false, s);
    }
    assert.doesNotMatch(html, /data-i18n="hint_pane_contacts">[^<]*(Stages|Phasen)/);
  });
});

describe('contacts.js', () => {
  test('no stage anywhere: column, sort, cell, inline editor, filters, chips', () => {
    assert.doesNotMatch(contacts, /stage/i);
  });
  test('a stored stage column is dropped safely', () => {
    const F = loadFns('public/js/contacts.js', ['effectiveContactColumns'], { state: { fields: [], contactColumns: [{ key: 'stage_id', visible: true }, { key: 'company', visible: true }] } });
    const cols = F.effectiveContactColumns();
    assert.equal(cols.some(c => c.key === 'stage_id'), false);
    assert.equal(cols[0].key, 'company');
  });
});

describe('modals.js', () => {
  test('the contact functions carry no stage; the stage helpers are gone', () => {
    for (const fn of ['openContactModal', 'saveContact', 'contactDetailCardHtml', 'editContactDetail', 'saveContactDetail', 'applyContactFieldChange',
                      'renderContactPanelReadOnly', 'editContactPanel', 'saveContactPanel', 'openDetail', 'refreshContactDetailCard']) {
      assert.doesNotMatch(sliceFn(modals, fn, 'modals.js'), /stage/i, fn);
    }
    for (const fn of ['updateContactStage', 'moveContactStage', 'ensureStages', 'renderContactStagesList', 'openStageModal', 'saveStage', 'deleteStage', 'renderStagesList', 'stageDrop']) {
      assert.doesNotMatch(allJs, new RegExp(`^(async )?function ${fn}\\(`, 'm'), `${fn} still defined`);
    }
  });
  test('applyContactFieldChange sends six keys and no stage', () => {
    const F = loadFns('public/js/modals.js', ['applyContactFieldChange']);
    const out = F.applyContactFieldChange({ name: 'A', company: 'B', email: null, phone: '1', stage_id: 2, assigned_to: 3, custom_data: {} }, 'company', 'C');
    assert.deepEqual(Object.keys(out).sort(), ['assigned_to', 'company', 'custom_data', 'email', 'name', 'phone']);
  });
  test('the deal modal still loads what it needs after the contact-stage load left the Promise.all', () => {
    const open = sliceFn(modals, 'openDealModal', 'modals.js');
    assert.match(open, /const \[, , , pipelinesRes, dealFieldsRes, allContacts, allSuppliers, dealDataRes, objectsRes, objectFieldsRes\] = await Promise\.all\(\[\s*ensureContacts\(\),\s*ensureMembers\(\),\s*ensureFields\(\),/);
  });
});

describe('the rest of the client', () => {
  test('no global stages, no /api/stages, no contact-stage settings or import mapping', () => {
    assert.doesNotMatch(core, /^let stages\b/m);
    assert.doesNotMatch(core, /^let dragStageIdx\b/m);
    assert.equal(allJs.includes('/api/stages'), false);
    assert.doesNotMatch(auth, /\bstages\b/);
    assert.equal(settings.includes('contact-stages-list'), false);
    assert.equal(admin.includes("'stage'"), false, 'no Stage import mapping');
    assert.doesNotMatch(sliceFn(admin, 'exportContactsCSV', 'admin-import.js'), /Stage|stage_name/);
    assert.doesNotMatch(sliceFn(admin, 'processImportFile', 'admin-import.js'), /ensureStages/);
  });
  test('dictionaries: contact-stage keys gone from both, deal-stage keys kept, one opt_no_stage', () => {
    for (const k of ['set_contact_stages', 'hint_contact_stages', 'no_stages_yet', 'detail_stage', 'set_stages', 'hint_stages', 'add_stage_title', 'edit_stage_title', 'drop_here']) {
      assert.equal(k in dict.en || k in dict.de, false, k);
    }
    for (const k of ['col_stage', 'lbl_stage', 'stage_none', 'opt_no_stage', 'add_stage_btn']) assert.ok(k in dict.en && k in dict.de, k);
    assert.equal((core.match(/opt_no_stage:/g) || []).length, 2, 'declared once per language');
    assert.equal(dict.en.opt_no_stage, 'No stage');
    assert.doesNotMatch(dict.en.hint_pane_contacts, /Stage/);
    assert.doesNotMatch(dict.de.hint_pane_contacts, /Phase/);
  });
  test('stylesheet: contact-stage rules gone, deal-stage rules kept', () => {
    for (const r of ['.stage-pill-ctl', '.stage-pills {', '.stage-pill {', '.stage-pill-name', '.stage-dot-none', '.filter-opt-dot', '.filter-opt.has-dot', '.contact-card-stageline']) {
      assert.equal(css.includes(r), false, r);
    }
    for (const r of ['\n.stage-badge {', '\n.stage-badge-dot {', '\n.stage-stepper {', '\n.stage-step {', '\n.col-dot {']) assert.ok(css.includes(r), r);
  });
  test('deal-side stage code is untouched', () => {
    for (const fn of ['renderStageStepper', 'setDealStage', 'populateDealStages']) assert.match(modals, new RegExp(`^(async )?function ${fn}\\(`, 'm'), fn);
    assert.match(read('public/js/deals.js'), /^function currentStages\(/m);
    assert.match(sliceFn(modals, 'renderContactDeals', 'modals.js'), /stage-badge-dot/, 'a contact\'s deals still show the deal stage');
  });
});
