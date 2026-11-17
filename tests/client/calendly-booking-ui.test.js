// CLIENT (static + pure-function) tests for "Book meeting" while Calendly is the connected booking service
// (CALENDLY_CHANGES Part 4, public/js/detail-views.js). One dialog books at either service: Calendly's connection
// is read into the words the dialog knows from Cal.com. Pinned: the status asks Calendly only when Cal.com is not
// connected; the button shows for either service; a Calendly event type is named by its URI and its places carry
// their position; the dialog reads Calendly's two routes, sends no note, offers no Notetaker box, and says
// Calendly's refusals in the page's language; moving a meeting stays Cal.com's; every word is in both languages.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst, loadFns } = require('../helpers/client-fn');

const dv   = read('public/js/detail-views.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const dialog = dv.slice(dv.indexOf('async function openCalcomBooking('), dv.indexOf('async function openDealForm('));

const T1 = 'https://api.calendly.com/event_types/T1', T2 = 'https://api.calendly.com/event_types/T2', T3 = 'https://api.calendly.com/event_types/T3';
const CALENDLY = {
  name: 'Mara Kühn', email: 'mara@example.de', timezone: 'Europe/Berlin', host_user_id: 2,
  event_type: { uri: T1, name: 'Erstgespräch', slug: 'erst', duration: 30 },
  event_types: [
    { uri: T1, name: 'Erstgespräch', duration: 30, poolingType: null, locations: [{ kind: 'google_conference' }, { kind: 'outbound_call' }, { kind: 'physical', location: 'Hauptstr. 1, Bonn' }] },
    { uri: T2, name: 'Kurz', duration: null, poolingType: null, locations: [] },
    { uri: T3, name: 'Team', duration: 45, poolingType: 'round_robin', locations: [{ kind: 'zoom_conference' }] },
  ],
};
const CALCOM = { cal_name: 'Mara', event_type: { id: 11, title: 'Erstgespräch' }, event_types: [{ id: 11, title: 'Erstgespräch' }], host_user_id: 2 };

const STUBS = `
  const t = k => k; const tf = (k, v) => k + ':' + Object.values(v).join('/');
  const esc = s => String(s); const icon = n => '<i-' + n + '>';
  const asked = []; let replies = {};
  const api = { get: async url => { asked.push(url); const r = replies[url.split('?')[0]]; if (r === 'throw') throw new Error('offline'); return r; } };
  function script(r) { replies = r; asked.length = 0; }
  function calls() { return asked.slice(); }
`;
const load = () => loadFns('public/js/detail-views.js',
  ['dvCalcomStatus', 'dvCalcomReady', 'dvCalendlyReady', 'dvBookReady', 'dvCalendlyAsCal', 'dvBookingCal', 'dvCalendlyPlace', 'dvBookButton'],
  { state: { dvCalcomCache: { at: 0, data: null } }, extra: [STUBS, sliceConst('public/js/detail-views.js', 'DV_CALENDLY_APPS')].join('\n'), expose: ['script', 'calls'] });

describe('the status: Cal.com first, Calendly only without it', () => {
  test('Cal.com connected: Calendly is not asked', async () => {
    const F = load();
    F.script({ '/api/integrations/calcom': { connected: true, calcom: CALCOM } });
    const s = await F.dvCalcomStatus();
    assert.deepEqual(F.calls(), ['/api/integrations/calcom']);
    assert.equal(F.dvCalcomReady(s), true); assert.equal(F.dvCalendlyReady(s), false); assert.equal(F.dvBookReady(s), true);
    assert.equal(F.dvBookingCal(s), s.calcom, 'Cal.com\'s own status, untouched');
  });
  test('without Cal.com, Calendly\'s status rides along and makes booking ready', async () => {
    const F = load();
    F.script({ '/api/integrations/calcom': { connected: false, calcom: null }, '/api/integrations/calendly': { connected: true, calendly: CALENDLY } });
    const s = await F.dvCalcomStatus();
    assert.deepEqual(F.calls(), ['/api/integrations/calcom', '/api/integrations/calendly']);
    assert.equal(s.connected, false, 'Cal.com is still not connected');
    assert.equal(s.calendly.email, 'mara@example.de');
    assert.equal(F.dvCalcomReady(s), false); assert.equal(F.dvCalendlyReady(s), true); assert.equal(F.dvBookReady(s), true);
    // cached a minute, like Cal.com's
    await F.dvCalcomStatus();
    assert.equal(F.calls().length, 2);
    // a fresh read asks both again (Cal.com with its ?fresh=1)
    await F.dvCalcomStatus(true);
    assert.deepEqual(F.calls().slice(2), ['/api/integrations/calcom?fresh=1', '/api/integrations/calendly']);
  });
  test('neither connected, Calendly connected without an event type, Calendly unreachable: no booking', async () => {
    for (const cly of [{ connected: false, calendly: null }, { connected: true, calendly: { ...CALENDLY, event_type: null } }, { error: 'x' }, 'throw']) {
      const F = load();
      F.script({ '/api/integrations/calcom': { connected: false, calcom: null }, '/api/integrations/calendly': cly });
      const s = await F.dvCalcomStatus();
      assert.equal(F.dvBookReady(s), false, JSON.stringify(cly));
      assert.equal(F.dvBookingCal(s), null);
      assert.equal(F.dvBookButton(s), '', 'no button');
    }
    const F = load();
    F.script({ '/api/integrations/calcom': 'throw' });
    assert.equal(await F.dvCalcomStatus(), null, 'the status itself failed: nothing, and Calendly is not asked');
    assert.deepEqual(F.calls(), ['/api/integrations/calcom']);
  });
  test('the button is the same one for either service', () => {
    const F = load();
    const cly = F.dvBookButton({ connected: false, calcom: null, calendly: CALENDLY });
    assert.equal(cly, F.dvBookButton({ connected: true, calcom: CALCOM }));
    assert.match(cly, /<button class="btn btn-secondary" data-act="book" ><i-calendar>cal_book_btn<\/button>/);
    assert.match(F.dvBookButton({ connected: false, calcom: null, calendly: CALENDLY }, 'no email'), /disabled title="no email"/);
  });
});

describe('Calendly\'s connection in the dialog\'s words', () => {
  const F = load();
  const cal = F.dvCalendlyAsCal(CALENDLY);
  test('the account, the host, and the event types named by their URI with their length', () => {
    assert.equal(cal.service, 'calendly');
    assert.deepEqual([cal.cal_name, cal.cal_email, cal.host_user_id], ['Mara Kühn', 'mara@example.de', 2]);
    assert.deepEqual(cal.event_types.map(x => [x.id, x.title, x.lengthInMinutes]), [[T1, 'Erstgespräch', 30], [T2, 'Kurz', null], [T3, 'Team', 45]]);
    assert.equal(cal.event_type, cal.event_types[0], 'the chosen type is the full one from the list (it has the places)');
    assert.equal(F.dvBookingCal({ connected: false, calcom: null, calendly: CALENDLY }).service, 'calendly');
    assert.equal(CALCOM.service, undefined, 'Cal.com\'s status has no such mark: that is how the dialog tells them apart');
  });
  test('a type\'s places carry their position (what the server is told); a round robin has none to choose', () => {
    assert.deepEqual(cal.event_types[0].locations, [
      { type: 'calendly', kind: 'google_conference', text: '', index: 0 },
      { type: 'calendly', kind: 'outbound_call', text: '', index: 1 },
      { type: 'calendly', kind: 'physical', text: 'Hauptstr. 1, Bonn', index: 2 },
    ]);
    assert.deepEqual(cal.event_types[1].locations, []);
    assert.deepEqual(cal.event_types[2].locations, [], 'Calendly sets a round robin\'s place itself');
  });
  test('a chosen type that is no longer in the list still opens the dialog', () => {
    const gone = F.dvCalendlyAsCal({ ...CALENDLY, event_types: [] });
    assert.deepEqual(gone.event_type, { id: T1, title: 'Erstgespräch', lengthInMinutes: 30, locations: [] });
  });
  test('a place by name: the video app, the kind of place, the host\'s own text', () => {
    const name = (kind, text = '') => F.dvCalendlyPlace({ type: 'calendly', kind, text, index: 0 });
    assert.equal(name('google_conference'), 'Google Meet'); assert.equal(name('zoom_conference'), 'Zoom');
    assert.equal(name('microsoft_teams_conference'), 'Microsoft Teams'); assert.equal(name('webex_conference'), 'Webex'); assert.equal(name('gotomeeting_conference'), 'GoTo Meeting');
    assert.equal(name('physical', 'Hauptstr. 1, Bonn'), 'cal_loc_address:Hauptstr. 1, Bonn'); assert.equal(name('physical'), 'cal_loc_address_plain');
    assert.equal(name('outbound_call'), 'cly_loc_outbound_call'); assert.equal(name('inbound_call'), 'cly_loc_inbound_call'); assert.equal(name('ask_invitee'), 'cly_loc_ask_invitee');
    assert.equal(name('custom', 'Im Büro der Bank'), 'Im Büro der Bank'); assert.equal(name('custom'), 'cly_loc_other'); assert.equal(name('something_new'), 'cly_loc_other');
  });
});

describe('the dialog books at Calendly', () => {
  test('booking opens for whichever service is connected; moving a meeting needs Cal.com itself', () => {
    assert.match(dialog, /if \(!\(reschedule \? dvCalcomReady\(status\) : dvBookReady\(status\)\) \|\| !contact\) \{ ui\.toast\(t\('cal_status_none'\)\); return; \}/);
    assert.match(dialog, /let cal = reschedule \? status\.calcom : dvBookingCal\(status\);\s*const cly = cal\.service === 'calendly';/);
    assert.match(dv, /const dvIsLiveMeeting = a => !!\(a && a\.source === 'calcom' && a\.calcom_uid && !a\.cancelled_at\);/, 'a Calendly entry has no move or cancel button (not built)');
  });
  test('the free times and the booking go to Calendly\'s routes; the type is its URI, the place its position; no note, no recording', () => {
    assert.match(dialog, /const r = cly \? await api\.get\(`\/api\/integrations\/calendly\/slots\?from=\$\{B\.month\}-01&days=\$\{daysInMonth\(B\.month\)\}&event_type=\$\{encodeURIComponent\(B\.typeId\)\}`\)\s*: await api\.get\(`\/api\/integrations\/calcom\/slots\?/);
    assert.match(dialog, /: cly \? await api\.post\('\/api\/integrations\/calendly\/book', \{ deal_id: dealId, contact_id: contact\.id, event_type: B\.typeId, start: B\.picked, location: place \? place\.index : null \}\)\s*: await api\.post\('\/api\/integrations\/calcom\/book'/);
    assert.match(dialog, /const note = cly \? '' : `<div class="cal-book-sec">/, 'Calendly takes no note: the field is left out');
    assert.match(dialog, /const isMeet = l => !!l && l\.type === 'integration' && l\.integration === 'google-meet';/, 'a Calendly place is type calendly, so the Notetaker box (Google Meet through Cal.com) never shows for it');
  });
  test('an event type is found by its id as text (Cal.com: a number, Calendly: a URI) and printed escaped', () => {
    assert.match(dialog, /<select class="select" id="cal-book-type">\$\{types\.map\(x => `<option value="\$\{esc\(x\.id\)\}"\$\{x\.id === B\.typeId \? ' selected' : ''\}>/);
    assert.match(dialog, /B\.typeId = \(types\.find\(x => String\(x\.id\) === el\.value\) \|\| typeOf\(\)\)\.id;/);
    assert.doesNotMatch(dialog, /Number\(x\.id\)|B\.typeId = Number\(/, 'a URI is not a number');
  });
  test('the places of a Calendly type are offered and named', () => {
    assert.match(dialog, /\['address', 'link', 'phone', 'calendly'\]\.includes\(l\.type\)/);
    assert.match(dialog, /const placeLabel = l => l\.type === 'calendly' \? dvCalendlyPlace\(l\) : l\.type === 'integration' \?/);
  });
  test('what is said: Calendly sends the invitation, Calendly does not see the CRM\'s calendar, and its refusals in the page\'s language', () => {
    assert.match(dialog, /tf\(cly \? 'cly_book_done' : 'cal_book_done', \{ when \}\)/);
    assert.match(dialog, /t\(cly \? 'cly_book_conflict_hint' : 'cal_book_conflict_hint'\)/);
    assert.match(dialog, /const errText = r => \(cly && typeof clyErrorText === 'function' \? clyErrorText\(r\) : r\?\.error \|\| t\('cal_err_generic'\)\);/);
    assert.match(dialog, /if \(!r \|\| r\.error\) \{ B\.slots = \{\}; B\.err = errText\(r\); \}/);
    assert.match(dialog, /if \(!res \|\| res\.error\) \{ B\.err = errText\(res\); render\(\); return; \}/);
  });
  test('every word in both languages, German impersonal, the same placeholders', () => {
    const keys = ['cly_book_done', 'cly_book_conflict_hint', 'cly_loc_outbound_call', 'cly_loc_inbound_call', 'cly_loc_ask_invitee', 'cly_loc_other', 'cly_err_refused', 'cly_err_start', 'cly_err_contact', 'cly_err_no_phone', 'cly_err_location', 'cal_log_BOOKED_FROM_CRM'];
    for (const k of keys) {
      assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k);
      assert.notEqual(dict.en[k], dict.de[k], k);
      assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, `${k}: ${dict.de[k]}`);
      assert.deepEqual((dict.de[k].match(/\{\w+\}/g) || []).sort(), (dict.en[k].match(/\{\w+\}/g) || []).sort(), k);
    }
    for (const m of dialog.matchAll(/'(cly_\w+)'/g)) assert.ok(keys.includes(m[1]), m[1] + ' is covered here');
    assert.equal(dict.en.cly_book_done, 'Booked: {when}. Calendly sends the invitation.');
    assert.equal(dict.de.cly_book_done, 'Gebucht: {when}. Calendly schickt die Einladung.');
  });
  test('the card\'s log names a booking made from the CRM, and the booking\'s refusals have their sentences', () => {
    const js = read('public/js/calendly.js');
    assert.match(js, /BOOKED_FROM_CRM: 'cal_log_BOOKED_FROM_CRM'/);
    assert.match(js, /if \(res\.code === 'refused'\) return tf\('cly_err_refused', \{ detail: res\.detail \|\| '' \}\);/);
    assert.match(js, /start: 'cly_err_start', contact: 'cly_err_contact', no_email: 'cal_book_no_email', no_phone: 'cly_err_no_phone', location: 'cly_err_location'/);
  });
});
