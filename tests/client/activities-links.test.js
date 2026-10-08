// CLIENT (static) tests: on the Activities page, the contact and the deal an
// activity belongs to are links — clicking opens the contact or deal detail,
// the same openers the calendar's event detail uses.
//
// The feed used to print the contact name as plain text and knew nothing about
// deals. GET /api/activities now carries deal_id/deal_title (derived as the
// calendar derives them — tests/routes/activities-links.test.js), and the row
// links both when present. A row with no contact or no deal simply shows no
// link; nothing is invented.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const objects = read('public/js/objects.js');
const feed = sliceFn(objects, 'renderActivitiesFeed', 'objects.js');

describe('the Activities feed links to the contact and the deal', () => {
  test('the contact name is a link to openContactDetail, only when there is a contact_id', () => {
    // the reference row: an icon, then the name in a <span> so it can truncate
    assert.match(feed, /a\.contact_id \? `[^`]*onclick="event\.preventDefault\(\);openActivityContact\(\$\{a\.contact_id\}\)">\$\{icon\('users'\)\}<span>\$\{esc\(a\.contact_name \|\| 'Contact'\)\}<\/span><\/a>/);
  });
  test('the deal title is a link to openDealDetail, only when there is a deal_id', () => {
    assert.match(feed, /a\.deal_id \? `[^`]*onclick="event\.preventDefault\(\);openActivityDeal\(\$\{a\.deal_id\}\)">\$\{icon\('deals'\)\}<span>\$\{esc\(a\.deal_title \|\| 'Deal'\)\}<\/span><\/a>/);
  });
  test('both links are real anchors that do not navigate (href="#" + preventDefault)', () => {
    const anchors = feed.match(/<a href="#"[^>]*onclick="event\.preventDefault\(\);openActivity(Contact|Deal)\(/g) || [];
    assert.equal(anchors.length, 2);
  });
  test('names are escaped — a contact called <b>x</b> cannot inject markup into the feed', () => {
    assert.doesNotMatch(feed, /\$\{a\.contact_name\}/);
    assert.doesNotMatch(feed, /\$\{a\.deal_title\}/);
  });
  test('the openers it calls exist and delegate to the ones the calendar uses (plus a reload when the pop-up closes)', () => {
    assert.match(sliceFn(objects, 'openActivityDeal', 'objects.js'), /openDealDetail\(id, activityDetailOpts\(\)\)/);
    assert.match(sliceFn(objects, 'openActivityContact', 'objects.js'), /openContactDetail\(id, activityDetailOpts\(\)\)/);
    const dv = read('public/js/detail-views.js');
    assert.match(dv, /async function openContactDetail\(id/);
    assert.match(dv, /async function openDealDetail\(id/);
    const cal = read('public/js/calendar.js');
    assert.match(cal, /openContactDetail\(\$\{e\.contact_id\}\)/);
    assert.match(cal, /openDealDetail\(\$\{e\.deal_id\}\)/);
  });
  test('search also matches the deal title', () => {
    assert.match(sliceFn(objects, 'visibleActivities', 'objects.js'), /\$\{a\.deal_title \|\| ''\}/);
  });
});
