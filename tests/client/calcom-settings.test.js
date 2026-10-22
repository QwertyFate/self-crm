// CLIENT (static) tests for the Cal.com tab on the Integrations page (Cal.com
// integration, piece 3, 2026-10-13): the rail gets a Cal.com tab, the pane holds
// one card whose sections are switched by the server's connected / can_manage
// flags (owners and admins connect, pick the event type, refresh and
// disconnect; members see the account and the event type read-only), every
// string goes through the dictionary in both languages, the key field is a
// password field that is emptied after the request, and the script talks to
// exactly the five routes.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const js   = read('public/js/integrations.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const pane = html.slice(html.indexOf('<div id="intg-pane-calcom"'), html.indexOf('<!-- ── Workspaces page ── -->'));
const pageStart = html.indexOf('<section id="page-integrations"');
const rail = html.slice(pageStart, html.indexOf('<div class="settings-tab-body">', pageStart));   // the Settings page has a tab body of its own, earlier in the file

describe('the markup', () => {
  test('the rail: a separator and the Cal.com tab after Deliveries', () => {
    assert.match(rail, /data-tab="deliveries"[^\n]*\n\s*<div class="settings-tab-sep" aria-hidden="true"><\/div>\n\s*<button class="settings-tab" data-tab="calcom"\s+onclick="switchIntgTab\('calcom'\)"\s+data-i18n="intg_tab_calcom">Cal\.com<\/button>\n\s*<\/nav>/);
  });
  test('the pane: one card with the status badge, the connect section, the member line, the account, the event type, the actions and the message line', () => {
    assert.match(pane, /^<div id="intg-pane-calcom" class="settings-pane">/);
    assert.match(pane, /<h2 class="settings-pane-title" data-i18n="intg_pane_calcom">/); assert.match(pane, /<p class="settings-tab-hint" data-i18n="intg_pane_calcom_hint">/);
    assert.match(pane, /<div class="settings-card" id="cal-card">/); assert.equal((pane.match(/class="settings-card"/g) || []).length, 1, 'one card');
    assert.match(pane, /<span id="cal-status" class="badge" data-i18n="cal_status_none">/);
    assert.match(pane, /<p class="settings-hint hidden" id="cal-readonly-hint" data-i18n="cal_readonly_hint">/);
    assert.match(pane, /<div class="intg-section hidden" id="cal-connect-section">[\s\S]*<input type="password" id="cal-key" class="intg-url-input" autocomplete="off" spellcheck="false" placeholder="cal_live_…" data-i18n-ph="cal_key_ph" \/>\s*<\/div>/, 'the key is typed into a password field');
    assert.match(pane, /<p class="empty-inline hidden" id="cal-none" data-i18n="cal_none">/);
    assert.match(pane, /<div class="intg-section hidden" id="cal-account-section">[\s\S]*<div id="cal-facts"><\/div>/);
    assert.match(pane, /<div class="intg-section hidden" id="cal-type-section">[\s\S]*<select id="cal-event-type" class="form-control" onchange="saveCalcomEventType\(\)"><\/select>\s*<input type="text" id="cal-type-readonly" class="form-control hidden" readonly \/>/, 'members read the event type from a read-only field');
    assert.match(pane, /<div class="intg-section hidden" id="cal-log-section">[\s\S]*<div id="cal-log" class="intg-logs"><p class="empty-inline" data-i18n="cal_log_none">/, 'the booking log, in the lead log\'s clothes');
    assert.match(pane, /<div class="settings-card-actions" id="cal-actions">\s*<button class="btn btn-primary btn-sm hidden" id="cal-connect-btn" onclick="connectCalcom\(this\)" data-i18n="cal_btn_connect">[^<]*<\/button>\s*<button class="btn btn-sm hidden" id="cal-refresh-btn" onclick="refreshCalcomEventTypes\(this\)" data-i18n="cal_btn_refresh">[^<]*<\/button>\s*<button class="btn btn-sm hidden" id="cal-register-btn" onclick="registerCalcomWebhook\(this\)" data-i18n="cal_btn_register">[^<]*<\/button>\s*<button class="btn btn-sm btn-danger hidden" id="cal-disconnect-btn" onclick="disconnectCalcom\(\)" data-i18n="cal_btn_disconnect">[^<]*<\/button>\s*<span id="cal-msg" class="workspace-name-msg hidden"><\/span>\s*<\/div>/, 'one actions row: the three buttons, each shown by the script, and the message pill beside them');
    assert.match(read('public/style.css'), /^\.settings-tab\[data-tab="calcom"\]::before \{ --ico: url\("data:image\/svg\+xml;charset=utf-8,%3Csvg[^"]*stroke='black'[^"]*rect x='3' y='5'[^"]*"\); \}$/m, 'the rail icon: a calendar');
    assert.doesNotMatch(pane, /engine-|intg-url"|webhook_secret|receive_token/, 'nothing of the other tabs, nothing secret');
  });
  test('every string on the pane and in the script goes through the dictionary, in both languages, German impersonal', () => {
    const keys = new Set([...pane.matchAll(/data-i18n(?:-ph)?="(\w+)"/g)].map(m => m[1]));
    const cal = sliceCal();
    for (const m of cal.matchAll(/\bt[f]?\('(\w+)'(?=[,)])/g)) keys.add(m[1]);   // a key built at run time (t('cal_log_' + x)) is skipped, as the i18n sweep does
    assert.ok(keys.size >= 28, `keys used: ${keys.size}`);
    for (const k of keys) { assert.ok(dict.en[k], `en.${k}`); assert.ok(dict.de[k], `de.${k}`); }
    for (const k of Object.keys(dict.de).filter(k => /^cal_|^intg_(tab|pane)_calcom/.test(k))) assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, `${k}: ${dict.de[k]}`);
    assert.equal(dict.de.cal_connected_by_on, dict.en.cal_connected_by_on, 'the same two placeholders');
    for (const m of pane.matchAll(/<(h2|h3|p|button|span)\b[^>]*>([^<]+)</g)) if (m[2].trim()) assert.match(m[0], /data-i18n=/, m[0].slice(0, 80));
  });
});

// The Cal.com half of integrations.js: from its banner to the end of the file.
function sliceCal() { const i = js.indexOf('// ── Cal.com (the "calcom" tab)'); assert.ok(i > 0, 'the Cal.com block exists'); return js.slice(i); }

describe('the script', () => {
  test('loadIntegrations loads the Cal.com status; the seven routes, nothing else', () => {
    assert.match(sliceFn(js, 'loadIntegrations', 'integrations.js'), /loadEngineSettings\(\);\s*switchIntgTab\(currentIntgTab\);\s*loadCalcomSettings\(\);/, 'after the rail is switched, as the design test pins');
    const cal = sliceCal();
    assert.deepEqual([...cal.matchAll(/api\.(get|post|patch|del)\('([^']+)'/g)].map(m => [m[1], m[2]]),
      [['get', '/api/integrations/calcom'], ['post', '/api/integrations/calcom/connect'], ['patch', '/api/integrations/calcom'], ['post', '/api/integrations/calcom/refresh'], ['post', '/api/integrations/calcom/register-webhook'], ['get', '/api/integrations/calcom/logs'], ['del', '/api/integrations/calcom']]);
    assert.doesNotMatch(cal, /fetch\(|innerHTML = [^`]*\$\{(?!esc\()/, 'no raw fetch; nothing unescaped into innerHTML');
    for (const f of ['loadCalcomSettings', 'renderCalcom', 'calTypeLabel', 'showCalMsg', 'connectCalcom', 'saveCalcomEventType', 'refreshCalcomEventTypes', 'registerCalcomWebhook', 'loadCalcomLogs', 'disconnectCalcom']) assert.match(js, new RegExp(`^(async )?function ${f}\\(`, 'm'), f);
  });
  test('renderCalcom: the sections follow connected and can_manage; members get the event type as text; the key never reaches the page', () => {
    const r = sliceFn(js, 'renderCalcom', 'integrations.js');
    assert.match(r, /const c = d\.calcom, manage = !!d\.can_manage, connected = !!d\.connected && !!c;/);
    assert.match(r, /show\('cal-readonly-hint', !manage\);/); assert.match(r, /show\('cal-connect-section', manage && !connected\);/); assert.match(r, /show\('cal-none', !manage && !connected\);/);
    assert.match(r, /show\('cal-account-section', connected\);/); assert.match(r, /show\('cal-type-section', connected\);/); assert.match(r, /show\('cal-actions', manage\);/);
    assert.match(r, /show\('cal-connect-btn', manage && !connected\);\s*show\('cal-refresh-btn', manage && connected\);\s*show\('cal-register-btn', manage && connected && !c\?\.webhook_registered\);\s*show\('cal-disconnect-btn', manage && connected\);\s*show\('cal-log-section', connected\);/, 'the buttons follow the state inside the one actions row; the register button only while the webhook is missing');
    assert.match(r, /\[t\('cal_fact_webhook'\),\s*c\.webhook_registered \? t\('cal_webhook_on'\) : t\('cal_webhook_off'\) \+ \(c\.last_error \? ', ' \+ c\.last_error : ''\)/, 'the webhook row says registered or why not');
    assert.match(r, /if \(!connected\) return;\s*loadCalcomLogs\(\);/);
    assert.match(r, /status\.className = 'badge' \+ \(connected \? ' badge-success' : ''\)/);
    assert.match(r, /currentLang === 'de' \? 'de-DE' : 'en-GB'/, 'dates follow the language');
    assert.match(r, /if \(manage\) \{[\s\S]*sel\.classList\.remove\('hidden'\); ro\.classList\.add\('hidden'\);[\s\S]*\} else \{[\s\S]*ro\.value = c\.event_type \? calTypeLabel\(c\.event_type\) : t\('cal_no_event_types'\);/);
    assert.doesNotMatch(r, /api_key|sealed|receive_token|webhook_secret/);
    assert.match(sliceFn(js, 'calTypeLabel', 'integrations.js'), /tf\('cal_minutes', \{ n: x\.lengthInMinutes \}\)/);
  });
  test('connect sends the key once and empties the field whatever the answer; disconnect asks first; the select saves on change', () => {
    const c = sliceFn(js, 'connectCalcom', 'integrations.js');
    assert.match(c, /if \(!api_key\) \{ showCalMsg\(t\('cal_key_required'\), false\); input\?\.focus\(\); return; \}/);
    assert.match(c, /await api\.post\('\/api\/integrations\/calcom\/connect', \{ api_key \}\);\s*if \(input\) input\.value = '';/, 'emptied before the answer is looked at');
    assert.match(c, /finally \{\s*if \(btn\) btn\.disabled = false;/);
    const d = sliceFn(js, 'disconnectCalcom', 'integrations.js');
    assert.match(d, /await ui\.confirm\(\{ title: t\('cal_btn_disconnect'\), message: t\('cal_confirm_disconnect'\), confirmLabel: t\('cal_btn_disconnect'\), danger: true \}\)/);
    assert.match(d, /if \(!ok\) return;\s*const res = await api\.del\('\/api\/integrations\/calcom'\);/);
    const s = sliceFn(js, 'saveCalcomEventType', 'integrations.js');
    assert.match(s, /api\.patch\('\/api\/integrations\/calcom', \{ event_type_id: id \}\)/); assert.match(s, /if \(!id\) return;/);
  });
});

// ── Step 2, piece 4: the "Termin" type and the cancelled mark, wherever an activity is shown ──
describe('the meeting type', () => {
  const core = read('public/js/core.js'), objects = read('public/js/objects.js'), dv = read('public/js/detail-views.js'), cal = read('public/js/calendar.js'), css = read('public/style.css');
  test('API: POST and PATCH accept meeting; every activity read carries cancelled_at; the calendar union carries cancelled_at and source in both halves', () => {
    const act = read('routes/activities.js'), calr = read('routes/calendar.js');
    assert.equal((act.match(/\['note','call','email','whatsapp','meeting'\]\.includes\(type\)/g) || []).length, 2);
    assert.equal((act.match(/a\.completed, a\.source, a\.cancelled_at,/g) || []).length, 2, 'the list and the single read');
    assert.equal((calr.match(/a\.cancelled_at AS cancelled_at, a\.source AS source/g) || []).length, 2, 'both calendar queries, activity half');
    assert.equal((calr.match(/NULL::timestamptz AS cancelled_at, 'user' AS source/g) || []).length, 2, 'both calendar queries, task half, same columns');
    assert.match(read('db.js'), /CHECK\(type IN \('note','call','email','whatsapp','meeting'\)\)/);
  });
  test('client: the type is listed in the Activities page, the timelines and the calendar, with a calendar icon and the violet of the existing timeline style', () => {
    assert.match(objects, /^const ACT_TYPES = \['note', 'call', 'email', 'whatsapp', 'meeting'\];/m);
    assert.match(dv, /\{ id: 'meeting', label: 'act_meeting', icon: 'calendar', verb: 'act_verb_meeting', ph: 'act_ph_meeting' \}/);
    assert.match(cal, /\{ id: 'meeting',\s+key: 'act_meeting',\s+color: 'var\(--violet\)'\s+\}/);
    assert.match(core, /whatsapp: 'message-circle', meeting: 'calendar' \}/, 'ICON_ALIAS: the sprite symbol');
    assert.match(read('public/index.html'), /<symbol id="i-calendar"/);
    assert.match(css, /^\.tl-ic\.whatsapp \{[^\n]*\.tl-ic\.meeting \{ background: var\(--violet-bg\); color: var\(--violet\); border-color: var\(--violet-bd\); \}/m, 'the timeline style was already there');
    assert.match(css, /^\.cal-ev\.meeting  \{ background: var\(--violet-bg\);\s+color: var\(--violet\);\s+border-left-color: var\(--violet\); \}$/m);
    assert.match(css, /^\.cal-bar\.meeting, \.cal-dot\.meeting \{ background: var\(--violet\); \}$/m);
    for (const k of ['act_meeting', 'act_verb_meeting', 'act_ph_meeting', 'act_cancelled', 'src_calcom']) { assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k); }
    assert.equal(dict.de.act_meeting, 'Termin'); assert.equal(dict.de.act_cancelled, 'Abgesagt');
  });
  test('a cancelled booking stays visible and is marked: struck through on the calendar with the word in its title, a danger badge on the Activities page and in both timelines; a Cal.com badge names the source', () => {
    assert.match(cal, /cancelled: !!e\.cancelled_at,/);
    assert.equal((cal.match(/\$\{e\.completed \|\| e\.cancelled \? ' done' : ''\}\$\{e\.cancelled \? ' cancelled' : ''\}/g) || []).length, 2, 'month cell and week block');
    assert.match(cal, /title="\$\{e\.cancelled \? esc\(t\('act_cancelled'\)\) \+ ': ' : ''\}/);
    assert.match(cal, /<div class="t truncate\$\{e\.completed \|\| e\.cancelled \? ' done' : ''\}">\$\{e\.cancelled \? esc\(t\('act_cancelled'\)\) \+ ': ' : ''\}/, 'the upcoming list');
    assert.match(css, /^\.cal-ev\.cancelled \{ opacity: \.55; text-decoration: line-through; \}$/m);
    assert.match(objects, /\$\{a\.cancelled_at \? `<span class="badge badge-danger">\$\{esc\(t\('act_cancelled'\)\)\}<\/span>` : ''\}\$\{a\.source === 'calcom' \? `<span class="badge badge-outline" title="\$\{esc\(t\('src_calcom'\)\)\}">\$\{esc\(t\('src_calcom'\)\)\}<\/span>` : ''\}/);
    assert.equal((dv.match(/\$\{a\.cancelled_at \? `<span class="badge badge-danger" style="margin-(right|left):6px">\$\{esc\(t\('act_cancelled'\)\)\}<\/span>` : ''\}/g) || []).length, 2, 'the deal timeline and the contact timeline');
  });
});

// ── Step 3, piece 3: booking from a deal or a contact ────────────────────────
describe('booking from a deal or a contact', () => {
  const dv = read('public/js/detail-views.js'), css = read('public/style.css');
  const book = dv.slice(dv.indexOf('/* ── Cal.com: booking a meeting from a deal or a contact'), dv.indexOf('async function openDealForm('));
  test('the status is fetched with the view and cached a minute; the button shows only while connected with an event type; a contact without an email gets the hint, not the dialog', () => {
    assert.match(dv, /^let dvCalcomCache = \{ at: 0, data: null \};/m);
    assert.match(book, /async function dvCalcomStatus\(fresh = false\) \{\s*if \(!fresh && Date\.now\(\) - dvCalcomCache\.at < 60000\) return dvCalcomCache\.data;[\s\S]*api\.get\('\/api\/integrations\/calcom' \+ \(fresh \? '\?fresh=1' : ''\)\)/, 'cached a minute, unless a fresh read is asked for');
    assert.match(book, /render\(\); load\(\);\s*\/\/ meanwhile[^\n]*\n\s*dvCalcomStatus\(true\)\.then\(fresh => \{\s*if \(!dvCalcomReady\(fresh\) \|\| !host\.isConnected\) return;\s*cal = fresh\.calcom; types = /, 'the dialog opens at once and re-reads the event types in the background, so a location added in Cal.com shows on the next open');
    assert.match(read('routes/integrations.js'), /calRefreshStaleTypes\(req\.workspaceId, await loadCalRow\(req\.workspaceId\), req\.query\.fresh === '1'\)/);
    assert.match(book, /function dvCalcomReady\(status\) \{ return !!\(status && status\.connected && status\.calcom && status\.calcom\.event_type\); \}/);
    assert.match(book, /function dvBookButton\(status, disabledTitle\) \{\s*if \(!dvCalcomReady\(status\)\) return '';/, 'no button without Cal.com');
    assert.match(book, /data-act="book"[\s\S]{0,120}\$\{icon\('calendar'\)\}\$\{esc\(t\('cal_book_btn'\)\)\}/);
    assert.match(book, /if \(!reschedule && !contact\.email\) \{[\s\S]*t\('cal_book_no_email'\)[\s\S]*data-open-contact[\s\S]*openContactModal\(contact\.id\)/, 'the no-email path offers the contact form (a reschedule keeps the attendee, so it needs none)');
  });
  test('deal and contact views: the status joins the first fetch, the button sits with the other actions, book opens the dialog and refreshes the timeline after', () => {
    assert.match(dv, /const \[d, allContacts, allSuppliers, allTasks, objs, calStatus\] = await Promise\.all\(\[[^\]]*dvCalcomStatus\(\)\]\);/);
    assert.match(dv, /const S = \{ calcom: calStatus, d, contacts: allContacts,/);
    assert.match(dv, /data-type="whatsapp" \$\{dis\}>\$\{icon\('message-circle'\)\}WhatsApp<\/button>\s*\$\{dvBookButton\(S\.calcom, c \? '' : t\('dv_no_contact_deal'\)\)\}\s*<button class="btn btn-secondary btn-icon" data-act="more"/, 'the deal: after WhatsApp, before More; disabled without a contact');
    assert.match(dv, /book: \(\) => openCalcomBooking\(\{ dealId: S\.d\.id, contact: contactOf\(\), onBooked: async \(\) => \{ await loadActs\(\); render\('head main'\); \} \}\),/);
    assert.match(dv, /const \[c, contactDeals, allTasks, calStatus, contactDocs\] = await Promise\.all\(\[[^\]]*dvCalcomStatus\(\), api\.get\(`\/api\/contacts\/\$\{id\}\/documents`\)\]\);/, 'the documents fetch stays last, as its own test pins');
    assert.match(dv, /const S = \{ calcom: calStatus, c, deals:/);
    assert.match(dv, /WhatsApp<\/button>`\}\s*\$\{dvBookButton\(S\.calcom, S\.c\.email \? '' : t\('dv_no_email'\)\)\}\s*<button class="btn btn-secondary" data-act="edit-all">/, 'the contact: after WhatsApp, before Edit; disabled without an email');
    assert.match(dv, /book: \(\) => openCalcomBooking\(\{ contact: S\.c, onBooked: async \(\) => \{ const fresh = await api\.get\(`\/api\/contacts\/\$\{id\}`\); if \(fresh && !fresh\.error\) S\.c = fresh; render\(\); \} \}\),/);
  });
  test('the dialog: event type, a month calendar (Monday first, the free days enabled, the first preselected, arrows by month), then a time dropdown in the viewer\'s zone, a note; a picked time is checked against the CRM calendar; Book posts the slot; the entry refreshes after', () => {
    assert.match(book, /ui\.modal\(\{ title: tf\(reschedule \? 'cal_resched_title' : 'cal_book_title', \{ name: contact\.name \}\), size: 'md', body: '<div id="cal-book" class="cal-book"><\/div>'/);
    assert.match(book, /const B = \{ month: todayIso\.slice\(0, 7\), typeId: \(reschedule && reschedule\.calcom_event_type_id\) \|\| cal\.event_type\.id, slots: null, loading: true, date: '', picked: null, conflicts: \[\], checking: false, note: '', err: '', busy: false, loc: 0, record: false, nt: 'idle', ntWhy: '' \};/, 'this month on the calendar, the chosen event type (or the moved booking\'s) and its first place preselected; the Notetaker box unticked and not yet asked for (notetaker-ui.test.js)');
    assert.match(book, /api\.get\(`\/api\/integrations\/calcom\/slots\?from=\$\{B\.month\}-01&days=\$\{daysInMonth\(B\.month\)\}&event_type_id=\$\{B\.typeId\}\$\{reschedule \? '&reschedule_uid=' \+ encodeURIComponent\(reschedule\.calcom_uid\) : ''\}`\)/, 'the whole month in one read; a moved booking\'s own slot counts as free');
    assert.match(book, /B\.date = monthDays\(\)\.find\(bookable\) \|\| '';/, 'the first bookable day is preselected');
    assert.match(book, /const lead = ym => \(new Date\(ym \+ '-01T00:00:00Z'\)\.getUTCDay\(\) \+ 6\) % 7;/, 'Monday first');
    assert.match(book, /const bookable = d => d >= todayIso && slotsOf\(d\)\.length > 0;/, 'a day is bookable when it is not past and has a free time');
    assert.match(book, /const dows = Array\.from\(\{ length: 7 \}, \(_, i\) => new Date\(Date\.UTC\(2024, 0, 1 \+ i\)\)\.toLocaleDateString\(locale, \{ weekday: 'short', timeZone: 'UTC' \}\)\);/, 'weekday heads in the language');
    assert.match(book, /class="cal-book-dayb\$\{ok \? ' is-free' : ''\}\$\{on \? ' is-on' : ''\}\$\{d === todayIso \? ' is-today' : ''\}" data-day="\$\{d\}"\$\{ok \? '' : ' disabled'\} aria-pressed="\$\{on\}" aria-label="\$\{esc\(fmtDay\(d\)\)\}\$\{ok \? ', ' \+ esc\(n === 1 \? t\('cal_book_one_time'\) : tf\('cal_book_n_times', \{ n \}\)\) : ''\}">/, 'a day button: free, chosen, today; disabled otherwise; its label says how many free times');
    assert.match(book, /<div class="cal-book-month" role="group" aria-label="\$\{esc\(t\('cal_book_date'\)\)\}"><div class="cal-book-dows">[\s\S]*<div class="cal-book-grid">\$\{cells\}<\/div>\$\{monthDays\(\)\.some\(bookable\) \? '' : `<p class="help">\$\{esc\(t\('cal_book_none_month'\)\)\}<\/p>`\}/, 'the grid, and a line when the month has nothing free');
    assert.match(book, /on\(host, 'click', '\[data-day\]', \(e, el\) => \{ if \(!bookable\(el\.dataset\.day\)\) return; B\.date = el\.dataset\.day; B\.picked = null; B\.conflicts = \[\]; B\.err = ''; render\(\); host\.querySelector\('#cal-book-time'\)\?\.focus\(\); \}\);/, 'a day picks itself and hands the focus to the time');
    assert.doesNotMatch(book, /cal-book-date"|data-nav=|dayList\(/, 'the date dropdown and the fourteen-day window are gone');
    // Part 7: the layout in the system's own rhythm
    assert.match(book, /const field = \(id, labelKey, control\) => `<div class="field"><label class="label" for="\$\{id\}">\$\{esc\(t\(labelKey\)\)\}<\/label>\$\{control\}<\/div>`;/, 'every field: the system\'s label');
    assert.match(book, /: `<div class="cal-book-sec"><div class="field-row">\$\{typeSel\}\$\{whereSel\}<\/div><\/div>`;/, 'what: the type and the place side by side (when booking, not moving)');
    assert.match(book, /const when = `<div class="cal-book-sec">\$\{head\}\$\{grid\}\$\{timeSel\}<p class="help">\$\{esc\(tf\('cal_book_zone'/, 'when: the month head, the grid, the time, the zone as a hint');
    assert.match(book, /<span class="cal-book-range">\$\{esc\(monthTitle\(B\.month\)\)\}<\/span><span class="cal-book-navbtns"><button type="button" class="btn btn-secondary btn-sm btn-icon" data-mnav="-1" aria-label="\$\{esc\(t\('cal_book_month_prev'\)\)\}"\$\{B\.month <= todayIso\.slice\(0, 7\) \? ' disabled' : ''\}>\$\{icon\('chevron-left'\)\}<\/button><button type="button" class="btn btn-secondary btn-sm btn-icon" data-mnav="1" aria-label="\$\{esc\(t\('cal_book_month_next'\)\)\}">\$\{icon\('chevron-right'\)\}<\/button>/, 'the month left, its two arrows right; never before this month');
    assert.match(book, /const summary = slot \? `<div class="cal-book-summary">\$\{icon\('calendar'\)\}<div><b>\$\{esc\(fmtDay\(B\.date\)\)\}, \$\{esc\(tf\('cal_book_slot'[\s\S]*tf\('cal_book_with', \{ name: contact\.name \}\)/, 'the one accent: what will be booked, with whom and where');
    assert.match(book, /host\.innerHTML = `<p class="help">\$\{esc\(tf\('cal_book_invite_to', \{ email: contact\.email \}\)\)\}<\/p>\$\{what\}\$\{rec\}\$\{when\}\$\{conflict\}\$\{note\}\$\{summary\}/, 'the order: who gets the invitation, what, the Notetaker box (Google Meet only), when, the check, the note, the summary');
    for (const k of ['cal_book_invite_to', 'cal_book_with']) { assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k); }
    assert.match(book, /<select class="select" id="cal-book-time"\$\{B\.date \? '' : ' disabled'\}><option value="">\$\{esc\(t\('cal_book_time_ph'\)\)\}<\/option>\$\{slotsOf\(B\.date\)\.map\(s => `<option value="\$\{esc\(s\.start\)\}"/, 'a time dropdown for the chosen day');
    assert.match(book, /toLocaleTimeString\(locale, \{ hour: '2-digit', minute: '2-digit', timeZone: zone \}\)/, 'times in the viewer\'s zone');
    assert.match(book, /const fmtAmPm = iso => new Date\(iso\)\.toLocaleTimeString\('en-US', \{ hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone \}\);/, 'and on a 12-hour clock beside it');
    assert.match(book, /tf\('cal_book_slot', \{ from: fmtTime\(s\.start\), to: fmtTime\(slotEnd\(s\)\), ampm: fmtAmPm\(s\.start\) \}\)/, 'a slot reads "14:00 bis 14:30 (2:00 PM)"');
    assert.match(book, /found\.push\(\{ time: `\$\{v\.time\} \(\$\{ampmOf\(v\.time\)\}\)`,/, 'the conflict line too');
    assert.match(book, /const when = `\$\{fmtWhen\(B\.picked\)\} \(\$\{fmtAmPm\(B\.picked\)\}\)`;/, 'and the toast');
    assert.equal(dict.de.cal_book_slot, '{from} bis {to} ({ampm})'); assert.equal(dict.en.cal_book_slot, '{from} to {to} ({ampm})');
    assert.match(book, /on\(host, 'click', '\[data-mnav\]', \(e, el\) => \{ B\.month = addMonths\(B\.month, Number\(el\.dataset\.mnav\)\); if \(B\.month < todayIso\.slice\(0, 7\)\) B\.month = todayIso\.slice\(0, 7\); load\(\); \}\);/, 'the arrows move by month and reload');
    assert.match(book, /on\(host, 'change', '#cal-book-time', \(e, el\) => \{ B\.picked = el\.value \|\| null; B\.conflicts = \[\]; B\.err = ''; if \(B\.picked\) checkConflicts\(\); else render\(\); \}\);/, 'picking a time runs the conflict check');
    assert.match(book, /const people = new Set\(\[currentUser\?\.id, cal\.host_user_id\]\.filter\(Boolean\)\);/, 'the booker and the host');
    assert.match(book, /api\.get\(`\/api\/calendar\?start=\$\{dvAddDays\(sv\.date, -1\)\}&end=\$\{dvAddDays\(sv\.date, 1\)\}`\)/, 'the CRM calendar around that day');
    assert.match(book, /if \(!e\.event_time \|\| e\.cancelled_at \|\| e\.completed \|\| e\.status === 'done' \|\| !people\.has\(e\.created_by\)\) continue;/, 'all-day, cancelled, done and other people\'s entries do not collide');
    assert.match(book, /const v = toViewerClock\(e\.event_date, e\.event_time, e\.event_tz\);/, 'compared on the viewer\'s clock');
    assert.match(book, /const t0 = mins\(v\.time\), t1 = t0 \+ 30;\s*if \(t0 < s1 && t1 > s0\)/, 'a CRM entry counts as 30 minutes, as the calendar draws it');
    assert.match(book, /go\.textContent = B\.busy \? t\(reschedule \? 'cal_resched_busy' : 'cal_book_booking'\) : B\.conflicts\.length \? t\('cal_book_anyway'\) : t\(reschedule \? 'cal_resched_submit' : 'cal_book_submit'\);/, 'a conflict warns; booking (or moving) anyway stays possible');
    assert.match(book, /api\.post\('\/api\/integrations\/calcom\/book', \{ deal_id: dealId, contact_id: contact\.id, event_type_id: B\.typeId, start: B\.picked, note: B\.note, language: currentLang, location: /);
    assert.match(book, /m\.close\(\);\s*ui\.toast\(reschedule \? tf\('cal_resched_done', \{ when, name: contact\.name \}\) : tf\('cal_book_done', \{ when \}\)\);\s*if \(res\.notetaker\) dvNotetakerToast\(res\.notetaker\);\s*if \(onBooked\) await onBooked\(res\);/);
    assert.match(book, /go\.disabled = !B\.picked \|\| B\.busy \|\| B\.checking;/);
    // Part 6: where it happens
    assert.match(book, /const placesOf = \(\) => \(Array\.isArray\(typeOf\(\)\.locations\) \? typeOf\(\)\.locations : \[\]\)\.filter\(l => l && \(l\.type === 'integration' \? !!l\.integration : \['address', 'link', 'phone'\]\.includes\(l\.type\)\)\);/, 'the type\'s locations a booker can choose');
    assert.match(book, /const APPS = \{ 'cal-video': 'Cal Video', 'google-meet': 'Google Meet', zoom: 'Zoom', 'office365-video': 'Microsoft Teams'/, 'the video apps by name');
    assert.match(book, /const whereSel = places\.length \? field\('cal-book-where', 'cal_book_where', `<select class="select" id="cal-book-where">/, 'a Where dropdown, only when the type has somewhere to choose');
    assert.match(book, /on\(host, 'change', '#cal-book-type', \(e, el\) => \{ B\.typeId = Number\(el\.value\); B\.loc = 0; load\(\); \}\);\s*on\(host, 'change', '#cal-book-where', \(e, el\) => \{ B\.loc = Number\(el\.value\) \|\| 0; render\(\); \}\);/);
    assert.match(book, /location: place \? \(place\.type === 'integration' \? \{ type: 'integration', integration: place\.integration \} : \{ type: place\.type \}\) : null, record: !!\(B\.record && B\.nt === 'ok' && isMeet\(place\)\) \}\)/, 'the chosen place goes with the booking; none means the type\'s default; the Notetaker box rides along (Google Meet only, once the Notetaker said it is there)');
    for (const k of ['cal_book_where', 'cal_loc_address', 'cal_loc_address_plain', 'cal_loc_link', 'cal_loc_phone']) { assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k); }
    assert.equal(dict.de.cal_book_where, 'Wo');
    assert.doesNotMatch(book, /data-slot|cal-book-days/, 'the chip grid is gone');
    for (const k of ['cal_book_btn', 'cal_book_title', 'cal_book_type', 'cal_book_zone', 'cal_book_month_prev', 'cal_book_month_next', 'cal_book_loading', 'cal_book_none_month', 'cal_book_note', 'cal_book_note_ph', 'cal_book_submit', 'cal_book_booking', 'cal_book_pick_first', 'cal_book_done', 'cal_book_no_email', 'cal_book_open_contact', 'cal_log_BOOKED_FROM_CRM', 'cal_book_date', 'cal_book_time', 'cal_book_time_ph', 'cal_book_one_time', 'cal_book_n_times', 'cal_book_checking', 'cal_book_conflict', 'cal_book_conflict_hint', 'cal_book_anyway', 'cal_book_slot']) { assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k); }
    assert.equal(dict.de.cal_book_btn, 'Termin buchen'); assert.equal(dict.de.cal_book_anyway, 'Trotzdem buchen');
    for (const sel of ['.cal-book {', '.cal-book-sec {', '.cal-book-nav {', '.cal-book-range {', '.cal-book-navbtns {', '.cal-book-conflict {', '.cal-book-summary {', '.cal-book-err {', '.cal-book-month {', '.cal-book-dows, .cal-book-grid {', '.cal-book-dayb {', '.cal-book-dayb.is-free {', '.cal-book-dayb.is-on, .cal-book-dayb.is-on:hover {', '.cal-book-dayb.is-today {', '@media (max-width: 600px) { .cal-book .field-row { grid-template-columns: 1fr; } }']) assert.ok(css.includes(sel), sel);
    assert.ok(!css.includes('.cal-book-pick') && !css.includes('.cal-book-zone'), 'the one-off rules are gone; the dialog uses .field-row, .label and .help');
    assert.match(read('routes/integrations.js'), /host_user_id: row\.host_user_id \?\? null,/, 'the status names the host\'s CRM user');
  });
});

// ── Part 11: cancel and reschedule a booked meeting ───────────────────────────
describe('a booked meeting: reschedule, cancel, delete', () => {
  const dv = read('public/js/detail-views.js'), objects = read('public/js/objects.js'), cal = read('public/js/calendar.js');
  const block = dv.slice(dv.indexOf('// ── Cal.com: a booked meeting\'s own actions'), dv.indexOf('async function openCalcomBooking('));
  const dialog = dv.slice(dv.indexOf('async function openCalcomBooking('), dv.indexOf('async function openDealForm('));
  test('a live meeting is an entry from Cal.com with a booking id that is not cancelled; its two icon buttons; the cancel confirmation with a reason; the delete guard with its two ways out', () => {
    assert.match(block, /const dvIsLiveMeeting = a => !!\(a && a\.source === 'calcom' && a\.calcom_uid && !a\.cancelled_at\);/);
    assert.match(block, /function dvMeetingButtons\(a\) \{\s*if \(!dvIsLiveMeeting\(a\)\) return '';/);
    assert.match(block, /data-act="act-resched" data-id="\$\{a\.id\}"[^`]*\$\{icon\('refresh'\)\}[\s\S]*data-act="act-meeting-cancel" data-id="\$\{a\.id\}"[^`]*\$\{icon\('x'\)\}/, 'move and cancel, as icon buttons');
    assert.match(block, /async function cancelCalcomMeeting\(activity, contactName, onDone\) \{\s*if \(!dvIsLiveMeeting\(activity\)\) return;\s*const m = ui\.modal\(\{ title: t\('cal_cancel_q'\), size: 'sm'/, 'cancel asks first');
    assert.match(block, /<textarea class="textarea" id="cal-cancel-reason" rows="2"><\/textarea>/); assert.match(block, /<button class="btn btn-danger" id="cal-cancel-go">\$\{esc\(t\('cal_cancel_btn'\)\)\}<\/button>/);
    assert.match(block, /api\.post\('\/api\/integrations\/calcom\/cancel', \{ activity_id: activity\.id, reason \}\)/);
    assert.match(block, /m\.close\(\);\s*ui\.toast\(t\('cal_cancel_done'\)\);\s*if \(onDone\) await onDone\(res\);/);
    assert.match(block, /async function dvDeleteActivityGuarded\(activity, contactName, \{ plain, deleteOnly, afterCancel \}\) \{\s*if \(!dvIsLiveMeeting\(activity\)\) return plain\(\);/, 'anything that is not a live meeting deletes as before');
    assert.match(block, /title: t\('cal_del_q'\), size: 'sm', body: `<p class="sub">\$\{esc\(t\('cal_del_msg'\)\)\}<\/p>`/);
    assert.match(block, /<button class="btn btn-secondary" data-del-only>\$\{esc\(t\('cal_del_only'\)\)\}<\/button><button class="btn btn-danger" data-cancel-meeting>\$\{esc\(t\('cal_cancel_btn'\)\)\}<\/button>/, 'delete here only, or cancel the meeting');
    assert.match(block, /on\(m\.el, 'click', '\[data-del-only\]', async \(\) => \{ m\.close\(\); await deleteOnly\(\); \}\);\s*on\(m\.el, 'click', '\[data-cancel-meeting\]', \(\) => \{ m\.close\(\); cancelCalcomMeeting\(activity, contactName, afterCancel\); \}\);/);
  });
  test('the dialog in reschedule mode: no email needed, the booking\'s own type and its current time shown read-only, its own slot counted as free, itself not a conflict, Move posts the new start', () => {
    assert.match(dialog, /async function openCalcomBooking\(\{ dealId = null, contact, onBooked, reschedule = null \} = \{\}\) \{/);
    assert.match(dialog, /if \(!reschedule && !contact\.email\) \{/, 'moving needs no email: the attendee stays');
    assert.match(dialog, /typeId: \(reschedule && reschedule\.calcom_event_type_id\) \|\| cal\.event_type\.id/);
    assert.match(dialog, /title: tf\(reschedule \? 'cal_resched_title' : 'cal_book_title', \{ name: contact\.name \}\)/);
    assert.match(dialog, /const current = reschedule && reschedule\.event_date \? toViewerClock\(reschedule\.event_date, reschedule\.event_time \|\| '00:00', reschedule\.event_tz\) : null;/, 'the current time on the viewer\'s clock');
    assert.match(dialog, /const what = reschedule\s*\? `<div class="cal-book-sec"><div class="field-row">\$\{field\('cal-book-type', 'cal_book_type', `<input type="text" id="cal-book-type" class="input" readonly value="\$\{esc\(typeOf\(\)\.title \|\| ''\)\}">`\)\}<div class="field"><span class="label">\$\{esc\(t\('cal_resched_current'\)\)\}<\/span>/, 'the type and the current time, read-only');
    assert.match(dialog, /\$\{reschedule \? '&reschedule_uid=' \+ encodeURIComponent\(reschedule\.calcom_uid\) : ''\}/);
    assert.match(dialog, /if \(reschedule && e\.kind !== 'task' && e\.id === reschedule\.id\) continue;/, 'the meeting being moved is not its own conflict');
    assert.match(dialog, /const res = reschedule\s*\? await api\.post\('\/api\/integrations\/calcom\/reschedule', \{ activity_id: reschedule\.id, start: B\.picked, reason: B\.note \}\)\s*: await api\.post\('\/api\/integrations\/calcom\/book'/);
    assert.match(dialog, /ui\.toast\(reschedule \? tf\('cal_resched_done', \{ when, name: contact\.name \}\) : tf\('cal_book_done', \{ when \}\)\);/);
    assert.match(dialog, /t\(reschedule \? 'cal_resched_submit' : 'cal_book_submit'\)/);
  });
  test('the deal view, the contact view, the Activities page and the calendar: the buttons on live meetings, the guarded delete, the handlers that reload after', () => {
    assert.equal((dv.match(/<span class="dd-tl-actions">\$\{dvMeetingButtons\(a\)\}<button class="iconbtn dd-ibtn" data-act="act-edit"/g) || []).length, 2, 'both timelines');
    assert.match(dv, /async function delAct\(aid\) \{\s*const a = S\.acts\.find\(x => x\.id === aid\), refresh = async \(\) => \{ await loadActs\(\); render\('head main'\); \};[\s\S]*await dvDeleteActivityGuarded\(a, contactOf\(\)\?\.name, \{\s*plain: async \(\) => \{ const ok = await ui\.confirm\(\{ title: t\('dv_delete_entry_q'\), message: t\('dv_delete_entry_deal_msg'\)[\s\S]*deleteOnly: remove, afterCancel: refresh,/, 'the deal view\'s delete, guarded');
    assert.match(dv, /'act-del': el => delAct\(\+el\.dataset\.id\), 'act-resched': el => reschedAct\(\+el\.dataset\.id\), 'act-meeting-cancel': el => cancelAct\(\+el\.dataset\.id\),/);
    assert.match(dv, /function reschedAct\(aid\) \{ const a = S\.acts\.find\(x => x\.id === aid\); if \(!a\) return; openCalcomBooking\(\{ reschedule: a, contact: contactOf\(\) \|\| \{ id: a\.contact_id, name: a\.contact_name \}, dealId: S\.d\.id, onBooked: async \(\) => \{ await loadActs\(\); render\('head main'\); \} \}\); \}/);
    assert.match(dv, /'act-del': async el => \{ const aid = \+el\.dataset\.id, a = acts\(\)\.find\(x => x\.id === aid\);[\s\S]*await dvDeleteActivityGuarded\(a, S\.c\.name, \{ plain: async \(\) => \{ const ok = await ui\.confirm\(\{ title: t\('dv_delete_entry_q'\), message: t\('dv_delete_entry_msg'\)/, 'the contact view\'s delete, guarded');
    assert.match(dv, /'act-resched': el => \{ const a = acts\(\)\.find\(x => x\.id === \+el\.dataset\.id\); if \(!a\) return; openCalcomBooking\(\{ reschedule: a, contact: S\.c, dealId: a\.deal_id \|\| null,/);
    assert.match(dv, /'act-meeting-cancel': el => \{ const a = acts\(\)\.find\(x => x\.id === \+el\.dataset\.id\); if \(!a\) return; cancelCalcomMeeting\(a, S\.c\.name,/);
    assert.match(objects, /if \(dvIsLiveMeeting\(a\)\) \{\s*items\.push\(\{ label: t\('cal_resched_btn'\), icon: 'refresh', onSelect: \(\) => openCalcomBooking\(\{ reschedule: a,[\s\S]*items\.push\(\{ label: t\('cal_cancel_btn'\), icon: 'x', danger: true, onSelect: \(\) => cancelCalcomMeeting\(a, a\.contact_name, \(\) => loadActivities\(\)\) \}\);\s*items\.push\(\{ sep: true \}\);\s*\}\s*items\.push\(\{ label: t\('delete_activity'\)/, 'the Activities page kebab');
    assert.match(objects, /async function deleteActivity\(id\) \{\s*const a = activities\.find\(x => x\.id === id\);[\s\S]*await dvDeleteActivityGuarded\(a, a\?\.contact_name, \{\s*plain: async \(\) => \{ const ok = await ui\.confirm\(\{ title: t\('delete_activity_q'\)/, 'the Activities page delete, guarded');
    assert.match(cal, /\$\{e\.calcom_uid \? `<span class="badge badge-outline">\$\{esc\(t\('src_calcom'\)\)\}<\/span>` : ''\}\s*\$\{e\.cancelled_at \? `<span class="badge badge-danger">\$\{esc\(t\('act_cancelled'\)\)\}<\/span>` : ''\}/, 'the calendar detail names the source and a cancellation');
    assert.match(cal, /footer: `\$\{dvJoinButton\(e, 'btn btn-primary'\)\}\$\{dvIsLiveMeeting\(e\) \? `<button class="btn btn-secondary" data-cal-resched>\$\{icon\('refresh'\)\}\$\{esc\(t\('cal_resched_btn'\)\)\}<\/button><button class="btn btn-danger-ghost" data-cal-cancel>\$\{icon\('x'\)\}\$\{esc\(t\('cal_cancel_btn'\)\)\}<\/button>` : ''\}<button class="btn btn-secondary" data-close>/);
    assert.match(cal, /on\(calDetailModal\.el, 'click', '\[data-cal-resched\]', \(\) => \{ const m = calDetailModal; calDetailModal = null; m\.close\(\); openCalcomBooking\(\{ reschedule: entry, contact: who, dealId: e\.deal_id \|\| null, onBooked: \(\) => renderCalendar\(\) \}\); \}\);/);
    assert.match(cal, /on\(calDetailModal\.el, 'click', '\[data-cal-cancel\]', \(\) => \{ const m = calDetailModal; calDetailModal = null; m\.close\(\); cancelCalcomMeeting\(entry, who\.name, \(\) => renderCalendar\(\)\); \}\);/);
    for (const k of ['cal_resched_btn', 'cal_resched_title', 'cal_resched_current', 'cal_resched_submit', 'cal_resched_busy', 'cal_resched_reason', 'cal_resched_reason_ph', 'cal_resched_done', 'cal_cancel_btn', 'cal_cancel_q', 'cal_cancel_msg', 'cal_cancel_reason', 'cal_cancel_busy', 'cal_cancel_done', 'cal_del_q', 'cal_del_msg', 'cal_del_only', 'cal_log_CANCELLED_FROM_CRM', 'cal_log_RESCHEDULED_FROM_CRM']) { assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k); }
    assert.equal(dict.de.cal_cancel_btn, 'Termin absagen'); assert.equal(dict.de.cal_resched_btn, 'Verschieben');
    for (const route of ['routes/activities.js', 'routes/contacts.js']) assert.match(read(route), /a\.calcom_uid, a\.calcom_event_type_id/, route + ' hands the booking id and its type to the views');
    assert.equal((read('routes/calendar.js').match(/a\.calcom_uid AS calcom_uid, a\.calcom_event_type_id AS calcom_event_type_id/g) || []).length, 2);
    assert.match(read('db.js'), /ADD COLUMN IF NOT EXISTS calcom_event_type_id INTEGER/);
  });
});

// ── Part 12: the meeting link one click away; the assignee told ───────────────
describe('the meeting link, one click away (Part 12)', () => {
  const dv = read('public/js/detail-views.js'), objects = read('public/js/objects.js'), cal = read('public/js/calendar.js'), notif = read('public/js/notifications.js');
  const line = name => { const m = dv.match(new RegExp('^const ' + name + ' = .*$', 'm')); assert.ok(m, name + ' is a one-line const'); return m[0]; };
  const STUBS = "const t = k => k; const tf = (k, v) => k + ':' + Object.values(v).join('/'); const icon = n => '<i ' + n + '>'; function esc(s) { return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }";
  const F = () => loadFns('public/js/detail-views.js', ['dvMeetingApp', 'dvJoinButton', 'dvJoinRow'], { extra: [STUBS, line('dvIsLiveMeeting'), line('dvMeetingLink'), sliceConst('public/js/detail-views.js', 'DV_MEETING_APPS')].join('\n') });
  test('the link is the first address in the entry\'s text; the app is read from its host; the button opens it in a new tab, named after the app, only for a live meeting with a link', () => {
    const f = F();
    for (const [url, app] of [['https://meet.google.com/abc-defg-hij', 'Google Meet'], ['https://us02web.zoom.us/j/1?pwd=x', 'Zoom'], ['https://teams.microsoft.com/l/meetup-join/x', 'Microsoft Teams'], ['https://app.cal.com/video/bk_1', 'Cal Video'], ['https://x.daily.co/room', 'Cal Video'], ['https://whereby.com/room', 'Whereby'], ['https://meet.jit.si/room', 'Jitsi'], ['https://example.org/room', null], ['not a url', null]]) assert.equal(f.dvMeetingApp(url), app, url);
    const live = { id: 50, source: 'calcom', calcom_uid: 'bk_1', cancelled_at: null, content: '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://meet.google.com/abc-defg-hij' };
    assert.equal(f.dvJoinButton(live), '<a class="btn btn-secondary btn-sm dv-join" href="https://meet.google.com/abc-defg-hij" target="_blank" rel="noopener"><i external>cal_join:Google Meet</a>');
    assert.equal(f.dvJoinButton(live, 'btn btn-primary'), '<a class="btn btn-primary dv-join" href="https://meet.google.com/abc-defg-hij" target="_blank" rel="noopener"><i external>cal_join:Google Meet</a>', 'the calendar detail asks for a primary button');
    assert.equal(f.dvJoinRow(live), '<div class="dv-join-row"><a class="btn btn-secondary btn-sm dv-join" href="https://meet.google.com/abc-defg-hij" target="_blank" rel="noopener"><i external>cal_join:Google Meet</a></div>');
    assert.equal(f.dvJoinButton({ ...live, content: 'T\nhttps://example.org/room' }), '<a class="btn btn-secondary btn-sm dv-join" href="https://example.org/room" target="_blank" rel="noopener"><i external>cal_join_link</a>', 'an unknown host: "open the link"');
    assert.equal(f.dvJoinButton({ ...live, cancelled_at: '2026-10-01T00:00:00Z' }), '', 'a cancelled meeting has no way in');
    assert.equal(f.dvJoinButton({ ...live, content: 'T' }), '', 'no link yet (Google Meet links arrive with the webhook): no button');
    assert.equal(f.dvJoinButton({ ...live, source: 'user', calcom_uid: null }), '', 'a meeting logged by hand gets no button; its text links are clickable anyway');
    assert.equal(f.dvJoinRow({ ...live, content: 'T' }), '');
  });
  test('every view: the button under the entry in both timelines and on the Activities page, first in the calendar detail\'s footer; the detail\'s note renders its links; a click on a link in a note follows it instead of opening the editor', () => {
    assert.match(dv, /^function dvActHtml\(s\) \{ return dvLinkify\(esc\(dvActText\(s\)\)\)\.replace\(\/\\n\/g, '<br>'\); \}$/m, 'links in every activity text');
    assert.match(dv, /^function dvLinkify\(escaped\) \{ return String\(escaped \|\| ''\)\.replace\(\/https\?:\\\/\\\/\[\^\\s<\]\*\[\^\\s<\.,;:!\?\)"'\]\/g, m => `<a href="\$\{m\}" target="_blank" rel="noopener">\$\{m\}<\/a>`\); \}$/m, 'on escaped text only, closing punctuation left outside');
    assert.equal((dv.match(/<div class="tl-text dd-pre" data-note="\$\{a\.id\}" title="\$\{esc\(t\('click_to_edit'\)\)\}">\$\{dvActHtml\(a\.content\)\}<\/div>\$\{dvJoinRow\(a\)\}`/g) || []).length, 2, 'the deal timeline and the contact timeline');
    assert.match(objects, /<div class="tl-text ac-text">\$\{dvActHtml\(a\.content\)\}<\/div>\$\{dvJoinRow\(a\)\}/, 'the Activities page');
    assert.match(cal, /<div class="cal-note">\$\{dvActHtml\(e\.content\) \|\| `<span class="muted">\$\{esc\(t\('cal_no_details'\)\)\}<\/span>`\}<\/div>/, 'the calendar detail\'s note, with its links');
    assert.match(cal, /footer: `\$\{dvJoinButton\(e, 'btn btn-primary'\)\}\$\{dvIsLiveMeeting\(e\) \?/, 'the calendar detail: the way in comes first');
    assert.equal((dv.match(/'\[data-note\]', \(e, el\) => \{ if \(e\.target\.closest\('a'\)\) return; if \(!String\(window\.getSelection\(\) \|\| ''\)\)/g) || []).length, 2, 'a click on a link is a click on a link, in both views');
    assert.equal((dv.match(/'\[data-note\]', \(e, el\) => \{ if \(!e\.target\.closest\('a'\)\) (noteEdit\(el\)|startNoteEdit\(\+el\.dataset\.note\)); \}/g) || []).length, 2, 'and so is a double click');
    assert.match(read('public/style.css'), /^\.dv-join-row \{ margin-top: 8px; \}/m);
  });
  test('the bell: a meeting on a deal or a contact of mine is announced by kind (booked, moved, cancelled) with the meeting\'s own title; a contact notification opens the contact; the keys exist in both languages', () => {
    assert.match(notif, /meeting_booked:\s+'📅',[\s\S]*meeting_moved:\s+'🗓️',\s*meeting_cancelled: '🚫',/);
    assert.match(notif, /^const NOTIF_KINDS = \{ meeting_booked: 'notif_meeting_booked', meeting_moved: 'notif_meeting_moved', meeting_cancelled: 'notif_meeting_cancelled', notetaker_done: 'notif_notetaker_done', notetaker_failed: 'notif_notetaker_failed' \};$/m);   // + the Notetaker's two (NOTETAKER_CHANGES Part 2)
    assert.match(notif, /function notifKind\(type\) \{ return NOTIF_KINDS\[type\] \? `<div class="notif-kind">\$\{esc\(t\(NOTIF_KINDS\[type\]\)\)\}<\/div>` : ''; \}/);
    assert.match(notif, /\$\{notifKind\(n\.type\)\}<div class="notif-title">\$\{esc\(n\.title\)\}<\/div>/, 'the kind above the title; older kinds look as before');
    assert.match(notif, /switchPage\('contacts'\);\s*if \(typeof openContactDetail === 'function'\) openContactDetail\(entityId\);/);
    assert.match(read('public/style.css'), /^\.notif-kind  \{ font-size: var\(--fs-2xs\); font-weight: 600; color: var\(--brand-ink\);/m);
    for (const k of ['notif_meeting_booked', 'notif_meeting_moved', 'notif_meeting_cancelled', 'cal_join', 'cal_join_link']) { assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k); assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, 'de.' + k + ' impersonal'); }
    assert.equal(dict.de.notif_meeting_booked, 'Termin gebucht'); assert.equal(dict.de.cal_join, '{app} beitreten'); assert.equal(dict.en.cal_join, 'Join {app}');
  });
  test('the server side: the receiver reads the link from both of Cal.com\'s fields; the booking carries the assignee as a guest; every meeting route tells the assignee once', () => {
    const route = read('routes/integrations.js'), calc = read('utils/calcom.js'), notes = read('notifications.js');
    assert.match(calc, /meetingUrl: urlOrNull\(p\.metadata\?\.videoCallUrl\) \|\| urlOrNull\(p\.videoCallData\?\.url\) \|\| urlOrNull\(p\.location\),/);
    assert.match(calc, /if \(guestList\.length\) body\.guests = guestList;/);
    assert.match(notes, /^async function notifyUser\(workspaceId, actorId, userId, \{ type, category, title, body, entityType, entityId \}\) \{/m);
    assert.match(route, /const \{ notifyUser \} = require\('\.\.\/notifications'\);/);
    assert.match(route, /^async function calTellAssignee\(wid, actorId, \{ kind, dealId, contactId, title, start, event_date, event_time, event_tz, url, location \}\) \{/m);
    assert.equal((route.match(/await calTellAssignee\(/g) || []).length, 6, 'book, cancel, reschedule from the CRM; created, moved, cancelled from Cal.com\'s page');
    assert.match(route, /RETURNING id, \(xmax = 0\) AS inserted`/, 'the receiver tells only of a NEW row: a booking the CRM made was announced by /calcom/book');
    assert.match(route, /if \(row\.inserted\) captured\.told = await calTellAssignee\(wid, null, \{ kind: 'booked'/);
    assert.match(route, /if \(mail && mail !== String\(row\.cal_email \|\| ''\)\.trim\(\)\.toLowerCase\(\) && mail !== String\(contact\.email\)\.trim\(\)\.toLowerCase\(\)\) guest = \{ id: u\.id, name: u\.name, email: mail \};/, 'never the host or the attendee as a guest');
    assert.match(route, /\/guest\/i\.test\(err\.message\)/, 'an event type that takes no guests: booked without them');
  });
});

// ── Part 13: the setup guide, in the Platforms tab's clothes ─────────────────
describe('the setup guide (Part 13)', () => {
  test('the panel sits in the card right after the key field; the script renders it like the Make guide (logo header, subtitle, numbered steps with markup, a note), open until connected, folded to its header after, with a button either way; every step in both languages, German impersonal, with the words that matter', () => {
    assert.match(pane, /<input type="password" id="cal-key"[^>]*\/>\s*<\/div>\s*<\/div>\s*<div class="intg-section hidden" id="cal-guide-section">\s*<div class="intg-guide-panel" id="cal-guide-panel"><\/div>\s*<\/div>\s*<p class="empty-inline hidden" id="cal-none"/, 'the guide panel follows the key field, in the Platforms tab\'s panel');
    const cal = sliceCal();
    assert.match(cal, /^const CAL_GUIDE = \{\s*logo: `<svg viewBox="0 0 40 40"[^`]*>Cal<\/text><\/svg>`,\s*steps: \['cal_guide_step1', 'cal_guide_step2', 'cal_guide_step3', 'cal_guide_step4', 'cal_guide_step5', 'cal_guide_step6', 'cal_guide_step7'\],\s*note: 'cal_guide_note',\s*\};$/m, 'seven steps and a note, as dictionary keys; an inline mark, as the platform logos are');
    assert.match(cal, /^let calGuideOpen = null;/m);
    assert.match(cal, /^function renderCalcomGuide\(connected\) \{[\s\S]*const open = calGuideOpen === null \? !connected : calGuideOpen;/m, 'open while nothing is connected, folded once connected, until a click decides');
    assert.match(cal, /const steps = CAL_GUIDE\.steps\.map\(k => `<li>\$\{t\(k\)\}<\/li>`\)\.join\(''\);/, 'the steps are dictionary strings with markup, inserted as-is like the Platforms guides');
    assert.match(cal, /<div class="intg-guide-header">\s*<div class="intg-guide-logo-sm">\$\{CAL_GUIDE\.logo\}<\/div>\s*<div>\s*<div class="intg-guide-title-text">\$\{esc\(t\('cal_guide_title'\)\)\}<\/div>\s*<div class="intg-guide-subtitle">\$\{esc\(t\('intg_setup_guide'\)\)\}<\/div>\s*<\/div>\s*<button type="button" class="btn btn-sm intg-guide-toggle" onclick="toggleCalcomGuide\(\)" aria-expanded="\$\{open\}" aria-controls="cal-guide-steps">\$\{esc\(open \? t\('cal_guide_hide'\) : t\('cal_guide_show'\)\)\}<\/button>\s*<\/div>/, 'the same header the Make guide has, plus the fold button');
    assert.match(cal, /\$\{open \? `<ol class="intg-guide-steps" id="cal-guide-steps">\$\{steps\}<\/ol><div class="intg-guide-note">\$\{t\(CAL_GUIDE\.note\)\}<\/div>` : ''\}/);
    assert.match(cal, /^function toggleCalcomGuide\(\) \{\s*const connected = !!calcomData\?\.connected && !!calcomData\?\.calcom;\s*calGuideOpen = !\(calGuideOpen === null \? !connected : calGuideOpen\);\s*renderCalcomGuide\(connected\);\s*\}/m);
    assert.match(cal, /show\('cal-guide-section', manage\);[^\n]*\n\s*renderCalcomGuide\(connected\);\s*if \(!connected\) return;/, 'rendered for whoever can connect, before the early return for a disconnected card');
    const css = read('public/style.css');
    assert.match(css, /^\.intg-guide-toggle \{ margin-left: auto; flex-shrink: 0; \}/m); assert.match(css, /^\.intg-json-note, \.intg-guide-note \{/m, 'the note looks like the Platforms note');
    const keys = ['cal_guide_title', 'cal_guide_show', 'cal_guide_hide', 'cal_guide_note', ...CAL_STEPS()];
    for (const k of keys) { assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k); assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, 'de.' + k + ' impersonal'); }
    for (const lang of ['de', 'en']) {
      const d = dict[lang];
      assert.match(d.cal_guide_step2, /<strong>[^<]*API[^<]*<\/strong>/, lang + ': the menu path to the keys, in bold'); assert.match(d.cal_guide_step2, /<strong>(Never expires|Läuft nie ab)<\/strong>/, lang + ': the expiry switch');
      assert.match(d.cal_guide_step3, /<code>cal_live_<\/code>/, lang + ': the key\'s prefix'); assert.match(d.cal_guide_step3, /only this once|nur dieses eine Mal/, lang + ': shown once');
      assert.match(d.cal_guide_step4, /<strong>(Connect|Verbinden)<\/strong>/, lang); assert.match(d.cal_guide_step6, /Google Meet/, lang); assert.match(d.cal_guide_step7, /<strong>(Register webhook|Webhook registrieren)<\/strong>/, lang);
      for (const k of CAL_STEPS()) assert.doesNotMatch(d[k], /<(?!\/?(strong|code)>)/, lang + '.' + k + ': only strong and code markup');
    }
    assert.equal(dict.de.cal_guide_title, 'So wird Cal.com verbunden'); assert.equal(dict.en.cal_guide_step4.includes('webhook registers itself'), true, 'no separate webhook step is needed on connect');
  });
  function CAL_STEPS() { return [1, 2, 3, 4, 5, 6, 7].map(i => 'cal_guide_step' + i); }
});
