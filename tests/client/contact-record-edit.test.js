// CLIENT (static + pure-function) tests for the contact record rework: no Edit
// mode (every value edits in place with one click), the assignee as an owner
// pill (a real <select> laid over the pill), a whole-record save from a fresh
// server copy, and no cache wipe after saving. Contacts have no stage.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const css = read('public/style.css');
const modals = read('public/js/modals.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

describe('the card', () => {
  test('head has no Edit button; the menu offers Edit all fields', () => {
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    assert.equal(card.includes('editContactDetail('), false, 'no Edit button in the head');
    assert.equal(card.includes('btn_edit'), false);
    assert.ok(card.includes('class="contact-card is-record"'));
    assert.ok(card.includes('openContactDetailMenu(event'));
    const menu = sliceFn(modals, 'openContactDetailMenu', 'modals.js');
    assert.match(menu, /editContactDetail\(/);
    assert.match(menu, /edit_all_fields/);
    assert.match(menu, /deleteContact\(/);
  });
  test('owner strip: the assignee pill sits over a native select; no stage on a contact', () => {
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    for (const s of ['owner-strip', 'owner-pill', 'is-unassigned', 'owner-pill-avatar', 'owner-pill-caption', 'owner-pill-name', 'pill-chevron',
                     'initials(c.assigned_to_name)', 'members.map(', 'assigned_to_lbl', 'assign_someone', 'opt_unassigned']) {
      assert.ok(card.includes(s), s);
    }
    assert.equal((card.match(/class="pill-select"/g) || []).length, 1, 'one pill select: the assignee');
    assert.match(card, /pill-select"[^>]*onchange="saveContactField\(\$\{id\}, 'assigned_to', this\.value\)"/);
    for (const s of ['stage-pill-ctl', 'updateContactStage', 'contact-card-stageline', 'contact-card-status', 'field-input-sm']) assert.equal(card.includes(s), false, `${s} is gone`);
  });
  test('every value is click-to-edit; the Added date is not', () => {
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    for (const [key, type] of [['name', 'text'], ['company', 'text'], ['email', 'email'], ['phone', 'phone']]) {
      assert.ok(card.includes(`startContactFieldEdit(this, \${id}, '${key}', '${type}')`), key);
    }
    assert.match(card, /startContactFieldEdit\(this, \$\{id\}, '\$\{f\.field_key\}', '\$\{f\.type\}'\)/, 'custom fields');
    for (const s of ['card-edit-hint', 'click_to_edit', 'data-value=', 'card-field-text', 'event.stopPropagation()']) assert.ok(card.includes(s), s);
    const added = card.match(/^.*fmtDate\(c\.created_at\).*$/m)[0];
    assert.equal(added.includes('startContactFieldEdit'), false, 'Added is read-only');
  });
  test('no inline styles, no glyphs', () => {
    const card = sliceFn(modals, 'contactDetailCardHtml', 'modals.js');
    assert.equal(card.includes('style="'), false);
    assert.doesNotMatch(card, /📅|🔗|✕|✏/);
  });
});

describe('editing in place', () => {
  test('startContactFieldEdit and contactFieldControl', () => {
    for (const fn of ['startContactFieldEdit', 'contactFieldControl', 'saveContactField', 'applyContactFieldChange']) assert.match(modals, new RegExp(`^(async )?function ${fn}\\(`, 'm'), fn);
    const edit = sliceFn(modals, 'startContactFieldEdit', 'modals.js');
    for (const s of ['dataset.value', 'contactFieldControl(', 'saveContactField(', "'Enter'", "'Escape'", 'stopPropagation()', "classList.add('editing')"]) assert.ok(edit.includes(s), s);
    assert.equal(edit.includes('contacts.find('), false, 'does not depend on the contacts cache');
    assert.equal(edit.includes('style='), false);
    const ctl = sliceFn(modals, 'contactFieldControl', 'modals.js');
    for (const s of ['inline-input', 'inline-select', "'dropdown'", 'opt_select', 'tel', 'date', 'url', 'number', 'email']) assert.ok(ctl.includes(s), s);
  });
  test('saveContactField saves the whole record from a fresh copy', () => {
    const save = sliceFn(modals, 'saveContactField', 'modals.js');
    assert.match(save, /api\.get\(`\/api\/contacts\/\$\{id\}`\)/);
    assert.match(save, /api\.put\(`\/api\/contacts\/\$\{id\}`, applyContactFieldChange\(/);
    assert.match(save, /name_required/);
    assert.match(save, /alert\(res\.error\)/);
    assert.match(save, /refreshContactDetailCard\(/);
    assert.equal(save.includes('invalidate()'), false);
  });
  test('applyContactFieldChange is pure and sends the six keys', () => {
    const F = loadFns('public/js/modals.js', ['applyContactFieldChange']);
    const contact = { id: 9, name: 'A', company: 'B', email: null, phone: '1', assigned_to: 3, custom_data: { k: 'v' }, assigned_to_name: 'Z' };
    const out = F.applyContactFieldChange(contact, 'company', 'C');
    assert.deepEqual(Object.keys(out).sort(), ['assigned_to', 'company', 'custom_data', 'email', 'name', 'phone']);
    assert.equal(out.company, 'C'); assert.equal(out.name, 'A'); assert.equal(out.assigned_to, 3);
    assert.deepEqual(out.custom_data, { k: 'v' }); assert.notEqual(out.custom_data, contact.custom_data);
    const c2 = F.applyContactFieldChange(contact, 'k2', 'x');
    assert.equal(c2.custom_data.k2, 'x'); assert.equal(c2.custom_data.k, 'v');
    assert.equal(F.applyContactFieldChange(contact, 'assigned_to', '7').assigned_to, 7);
    assert.equal(F.applyContactFieldChange(contact, 'assigned_to', '').assigned_to, null);
    assert.equal(F.applyContactFieldChange(contact, 'phone', '').phone, null);
    assert.equal(contact.company, 'B', 'input not mutated');
    assert.equal(contact.custom_data.k2, undefined, 'input custom_data not mutated');
  });
  test('no cache wipe after a save; the card loads members and fields', () => {
    assert.equal(sliceFn(modals, 'saveContactDetail', 'modals.js').includes('invalidate()'), false);
    for (const fn of ['refreshContactDetailCard', 'openDetail']) {
      const src = sliceFn(modals, fn, 'modals.js');
      assert.match(src, /ensureMembers\(\)/, `${fn} loads members`);
      assert.match(src, /ensureFields\(\)/, `${fn} loads fields`);
    }
  });
  test('keys exist in both dictionaries', () => {
    for (const k of ['assigned_to_lbl', 'assign_someone', 'click_to_edit', 'edit_all_fields', 'lbl_company', 'lbl_email', 'lbl_phone', 'opt_select', 'opt_unassigned']) {
      assert.ok(k in dict.en && k in dict.de, k);
    }
  });
});

describe('stylesheet', () => {
  test('owner strip, pills, click-to-edit values; the dead kanban card rules are gone', () => {
    for (const r of ['.contact-card.is-record .owner-strip {', '.owner-pill {', '.owner-pill-avatar {', '.owner-pill-caption {', '.owner-pill-name {', '.owner-pill.is-unassigned {',
                     '.pill-select {', '.pill-chevron {', '.contact-card.is-record .card-field {', '.card-edit-hint {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.equal(css.includes('.stage-pill-ctl'), false, 'no stage pill on a contact');
    assert.match(css, /\.pill-select \{[^}]*position: absolute;[^}]*inset: 0;[^}]*opacity: 0;[^}]*cursor: pointer/);
    assert.match(css, /\.owner-pill\.is-unassigned \{[^}]*border-style: dashed/);
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    assert.match(coarse, /\.card-edit-hint \{ opacity: 1; \}/);
    assert.doesNotMatch(css, /\.contact-card\.dragging|\.card-remove-btn|\n\.contact-card:hover \{/);
    const a = css.indexOf('.contact-card.is-record .owner-strip {'), b = css.indexOf('/* Blocks below the card', a);
    assert.ok(a > 0 && b > a);
    assert.doesNotMatch(css.slice(a, b), /#[0-9a-f]{3,6}\b/i, 'no new colours');
  });
});
