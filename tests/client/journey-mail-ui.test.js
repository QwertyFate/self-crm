// CLIENT (static + pure-function) tests for the journey's sending address (public/js/journey-mail.js,
// CUSTOMER_JOURNEY_CHANGES Part 2, 2026-11-19): the button at the top of the Customer Journey page, its window for
// each state (connected, not connected, not set up; owner and member), the way to Google's sign-in page and back, the
// test email, disconnecting, both dictionaries, and what an address or a name cannot do to the markup.
// Part 17 (2026-11-20), what keeps that address from being blocked: the part "Sending limits" (what went out as words
// and meters; the three limits for an owner and for a member; a Gmail and a Google Workspace address), saving the
// limits and the recommended values, the notice while sending is paused and "Send again now", the page's button,
// what the window reads again and what it keeps when it is drawn again, every refusal, and Google's words as text.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const core = read('public/js/core.js');
const auth = read('public/js/auth.js');
const jr   = read('public/js/journey.js');
const js   = read('public/js/journey-mail.js');
const css  = read('public/style.css');
const route = read('routes/journey-mail.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const count = (src, needle) => src.split(needle).length - 1;

// the sandbox: the file's own state, a recording api/ui/window/sessionStorage, and the real t/tf/esc/icon/fmtDate.
// The window is a stand-in that behaves like a browser's where the file depends on it: setting the body's markup
// makes its number fields and its two lines anew (a field holds the value its markup gives it, a line is empty and
// hidden), a selector finds only what the markup has, and what is given the cursor is written down.
const extra = [
  sliceFn(core, 'esc', 'core.js'),
  sliceConst('public/js/core.js', 'TRANSLATIONS'),
  sliceConst('public/js/core.js', 'ICON_ALIAS'),
  sliceFn(core, 't', 'core.js'),
  sliceFn(core, 'tf', 'core.js'),
  sliceFn(core, 'icon', 'core.js'),
  sliceFn(core, 'fmtDate', 'core.js'),
  sliceFn(jr, 'journeyWhen', 'journey.js'),
  sliceConst('public/js/journey-mail.js', 'JOURNEY_MAIL_RETURNS'),
  sliceConst('public/js/journey-mail.js', 'JOURNEY_MAIL_ERRORS'),
  sliceConst('public/js/journey-mail.js', 'JOURNEY_MAIL_LIMITS'),
  js.match(/^const JOURNEY_MAIL_NEAR = [\d.]+;/m)[0],
  `const __log = [];
   let __answers = {}, __confirm = true, __throw = false, __storageBlocked = false, __active = null;
   const __handlers = {}, __store = {}, __fields = {}, __asked = [];
   const __line = () => { const l = { textContent: '', hidden: true, bad: null, classList: { toggle(_c, on) { l.bad = on; } } }; return l; };
   const __note = __line(), __limitsNote = __line();
   const __clear = l => { l.textContent = ''; l.hidden = true; l.bad = null; };
   const __body = { __html: '', get innerHTML() { return this.__html; },
     set innerHTML(v) { this.__html = String(v); __clear(__note); __clear(__limitsNote);
       for (const k of Object.keys(__fields)) delete __fields[k];
       for (const m of this.__html.matchAll(/data-jm-limit="([a-z]+)" value="([^"]*)"/g)) { const f = __fields[m[1]] = { value: m[2], defaultValue: m[2], attrs: {}, focus() { __log.push(['focus', '[data-jm-limit="' + m[1] + '"]']); },
         setAttribute(n, v) { f.attrs[n] = v; }, removeAttribute(n) { delete f.attrs[n]; } }; } },
     contains: el => !!el && el.inside === true };
   const __has = name => [' ', '>', '='].some(c => __body.innerHTML.includes(name + c));
   const __el = { querySelector(sel) {
     __asked.push(sel);
     if (sel === '[data-close]') return { focus() { __log.push(['focus', sel]); } };
     const [name, quoted] = sel.slice(1, -1).split('=');
     if (!name.startsWith('data-jm-') || !__has(name)) return null;
     if (name === 'data-jm-note') return __note;
     if (name === 'data-jm-limits-note') return __limitsNote;
     if (name === 'data-jm-limit') return __fields[String(quoted).slice(1, -1)] || null;
     return { focus() { __log.push(['focus', sel]); }, click() { __log.push(['click', sel]); } };
   } };
   const document = { get activeElement() { return __active; } };
   // an answer may be a function: it is asked at the moment the request is made
   const __answer = (verb, url, body) => { __log.push(body === undefined ? [verb, url] : [verb, url, body]); if (__throw) throw new Error('offline'); const a = __answers[verb + ' ' + url]; return typeof a === 'function' ? a() : a; };
   const api = { get: async url => __answer('get', url), post: async (url, b) => __answer('post', url, b), put: async (url, b) => __answer('put', url, b), del: async url => __answer('del', url) };
   // core.js: a read without the loading bar. Written down as 'quiet'; it is answered what a GET of the address is.
   const apiFetchSilent = async url => { __log.push(['quiet', url]); if (__throw) throw new Error('offline'); return __answers['get ' + url]; };
   const ui = {
     modal: opts => { __log.push(['modal', opts]); __body.innerHTML = opts.body; return { el: __el, body: __body, close() { __log.push(['close']); opts.onClose && opts.onClose(); }, __opts: opts }; },
     confirm: async opts => { __log.push(['confirm', opts]); return __confirm; },
     toast: m => __log.push(['toast', m]),
   };
   function on(_root, type, selector, fn) { __handlers[type + ' ' + selector] = fn; }
   const sessionStorage = { setItem(k, v) { if (__storageBlocked) throw new Error('blocked'); __store[k] = v; } };
   const window = { location: { href: '/' } };
   function appRememberPage() { __log.push(['rememberPage']); }
   function renderJourney() { __log.push(['renderJourney']); }
   function __state() { return { journeyMail, journeyMailReturn, open: !!journeyMailWindow }; }
   function __reset(answers = {}) { __log.length = 0; __asked.length = 0; __answers = answers; __confirm = true; __throw = false; __storageBlocked = false; __active = null; window.location.href = '/';
     __body.innerHTML = '';
     for (const o of [__handlers, __store]) for (const k of Object.keys(o)) delete o[k]; }
   // 'active': what holds the cursor — { name, value } of its data attribute, inside the window's body unless inside is false
   function __opt(k, v) { if (k === 'confirm') __confirm = v; else if (k === 'throw') __throw = v; else if (k === 'storageBlocked') __storageBlocked = v; else if (k === 'answers') __answers = v;
     else if (k === 'active') __active = v && { inside: v.inside !== false, hasAttribute: n => n === v.name, getAttribute: n => (n === v.name ? v.value || '' : null) }; }
   function __page() { return { log: __log, asked: __asked, handlers: __handlers, store: __store, note: __note, limitsNote: __limitsNote, fields: __fields, body: __body, href: window.location.href }; }`,
].join('\n');
const NAMES = ['resetJourneyMail', 'journeyMailKeepReturn', 'loadJourneyMail', 'journeyMailAfterLoad', 'journeyMailErrorText', 'journeyMailSending', 'journeyMailPausedUntil', 'journeyMailCount', 'journeyMailMark',
  'journeyMailButtonHtml', 'journeyMailMeterHtml', 'journeyMailPauseHtml', 'journeyMailLimitsHtml', 'journeyMailLimitsOf', 'journeyMailBodyHtml', 'openJourneyMail',
  'journeyMailNote', 'journeyMailRedraw', 'journeyMailRefresh', 'connectJourneyMail', 'journeyMailSend', 'testJourneyMail', 'saveJourneyMailLimits', 'journeyMailDefaults', 'resumeJourneyMail', 'disconnectJourneyMail'];
const F = loadFns('public/js/journey-mail.js', NAMES, {
  state: { currentLang: 'en', journeyMail: null, journeyMailReturn: null, journeyMailWindow: null },
  extra, expose: ['__state', '__reset', '__opt', '__page'],
});

const CONNECTED = { provider: 'google', email: 'news@firma.de', connected_at: '2026-11-19T09:00:00.000Z', connected_by_name: 'Olga Owner' };
const params = q => new URLSearchParams(q);
function fill({ lang = 'en', mail = { configured: true, can_manage: true, connection: null }, answers = {} } = {}) {
  F.__reset(answers);
  F.__set('currentLang', lang); F.__set('journeyMail', mail); F.__set('journeyMailReturn', null); F.__set('journeyMailWindow', null);
}
const owns = connection => ({ configured: true, can_manage: true, connection });
const reads = connection => ({ configured: true, can_manage: false, connection });

// what the server says about sending (the contract of GET /api/journey/mail): a Gmail address and a Google Workspace one
const PERSONAL = { kind: 'personal', google_day: 500, limits: { day: 400, hour: 40, person: 3 }, defaults: { day: 400, hour: 40, person: 3 }, max: { day: 500, hour: 500, person: 20 },
  sent: { day: 37, hour: 5 }, paused_until: null, pause_reason: null, pause_detail: null };
const WORKSPACE = { ...PERSONAL, kind: 'workspace', google_day: 2000, limits: { day: 1500, hour: 150, person: 3 }, defaults: { day: 1500, hour: 150, person: 3 }, max: { day: 2000, hour: 2000, person: 20 },
  sent: { day: 1234, hour: 12 } };
const UNTIL = '2099-03-04T15:30:00.000Z';   // far ahead: a pause that is on whenever the tests run
const PAUSED = { ...PERSONAL, paused_until: UNTIL, pause_reason: 'google_limit', pause_detail: 'Daily user sending limit exceeded' };
const sends = (sending, manage = true) => ({ configured: true, can_manage: manage, connection: CONNECTED, sending });
const sent = (day, hour = 5) => sends({ ...PERSONAL, sent: { day, hour } });
const when = (iso, lang) => new Date(iso).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const tick = () => new Promise(resolve => setImmediate(resolve));   // lets what the window asked for by itself arrive
const type = values => { for (const [k, v] of Object.entries(values)) F.__page().fields[k].value = v; };
const held = () => Object.fromEntries(Object.entries(F.__page().fields).map(([k, f]) => [k, f.value]));
const marked = () => Object.entries(F.__page().fields).filter(([, f]) => f.attrs['aria-invalid'] === 'true').map(([k]) => k);   // the fields shown as out of range
const RANGES = 'The limits are whole numbers: per day from 1 to 500, per hour from 1 up to the daily limit, per person per day from 1 to 20.';

describe('markup and wiring', () => {
  test('the script is loaded once, after the journey page\'s own', () => {
    assert.equal(count(html, '<script src="js/journey-mail.js"></script>'), 1);
    assert.ok(html.indexOf('<script src="js/journey.js">') < html.indexOf('<script src="js/journey-mail.js">'));
  });
  test('the journey page asks for the button and the connection, and clears them on logout — each only if this file is there', () => {
    assert.match(sliceFn(jr, 'renderJourney', 'journey.js'), /actions\.innerHTML = \(typeof journeyMailButtonHtml === 'function' \? journeyMailButtonHtml\(\) : ''\) \+ \(typeof journeyHistoryButtonHtml === 'function' \? journeyHistoryButtonHtml\(\) : ''\) \+ \(journeyManage/);   // the record's button stands between the two (Part 15)
    assert.match(sliceFn(jr, 'journeyBoxHtml', 'journey.js'), /const mailOn = typeof journeyMail !== 'undefined' && !!journeyMail && !!journeyMail\.connection;/, 'an email step knows whether an address is connected');
    const load = sliceFn(jr, 'loadJourney', 'journey.js');
    assert.match(load, /typeof loadJourneyMail === 'function' \? loadJourneyMail\(\) : null/);
    assert.ok(load.indexOf('renderJourney();') < load.indexOf("if (typeof journeyMailAfterLoad === 'function') journeyMailAfterLoad();"), 'the page first, then what Google\'s round trip said');
    assert.match(sliceFn(jr, 'resetJourneyUI', 'journey.js'), /if \(typeof resetJourneyMail === 'function'\) resetJourneyMail\(\);/);
  });
  test('the app hands the address line to this file before it is cleared', () => {
    const init = sliceFn(auth, 'init', 'auth.js');
    const keep = init.indexOf('journeyMailKeepReturn(params);');
    assert.ok(keep > 0 && keep < init.indexOf('showApp();'));
    assert.match(sliceFn(auth, 'showApp', 'auth.js'), /window\.history\.replaceState\(\{\}, '', window\.location\.pathname\);/, 'showApp clears it');
  });
  test('the words Google\'s round trip can come back with are the route\'s, each with its sentence', () => {
    const words = new Function(`${sliceConst('public/js/journey-mail.js', 'JOURNEY_MAIL_RETURNS')} return JOURNEY_MAIL_RETURNS;`)();
    const sent = [...new Set([...route.matchAll(/back\(res, '([a-z_]+)'\)/g)].map(m => m[1]))];
    assert.deepEqual([...words].sort(), sent.sort());
    for (const w of words) { assert.ok(dict.en['jm_ret_' + w], `en: ${w}`); assert.ok(dict.de['jm_ret_' + w], `de: ${w}`); }
  });
  test('every refusal code of the route has its sentence', () => {
    const errors = new Function(`${sliceConst('public/js/journey-mail.js', 'JOURNEY_MAIL_ERRORS')} return JOURNEY_MAIL_ERRORS;`)();
    const codes = [...route.slice(route.indexOf('const ERRORS = {'), route.indexOf('const refuse')).matchAll(/^\s+([a-z_]+):\s+\[/gm)].map(m => m[1]);
    assert.deepEqual(Object.keys(errors).sort(), codes.sort());
    for (const k of Object.values(errors)) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
  });
  test('the window is wired for the limits and the pause, and uses the page\'s own way to write a moment', () => {
    fill({ mail: sends(PERSONAL) });
    F.openJourneyMail();
    assert.deepEqual(Object.keys(F.__page().handlers).sort(), ['click [data-jm-connect]', 'click [data-jm-disconnect]', 'click [data-jm-limits-defaults]', 'click [data-jm-limits-save]', 'click [data-jm-resume]',
      'click [data-jm-test]', 'input [data-jm-limit]', 'keydown [data-jm-limit]']);
    assert.equal(count(jr, 'function journeyWhen('), 1, 'journey.js, loaded before this file, has it');
    assert.doesNotMatch(js, /<form/, 'no form around the fields: the limits are sent by their own button');
  });
});

describe('both dictionaries', () => {
  const literals = [...new Set([...js.matchAll(/'(jm_[a-z0-9_]+)'/g)].map(m => m[1]))];
  const used = literals.filter(k => !k.endsWith('_')), prefixes = literals.filter(k => k.endsWith('_'));
  test('every key the file uses exists in English and German, and none is left unused', () => {
    assert.deepEqual(prefixes, ['jm_ret_']);
    assert.ok(used.length >= 54, `the file's own keys (${used.length})`);
    for (const k of used) { assert.ok(dict.en[k], `en: ${k}`); assert.ok(dict.de[k], `de: ${k}`); }
    assert.deepEqual(Object.keys(dict.en).filter(k => k.startsWith('jm_') && !used.includes(k) && !k.startsWith('jm_ret_')), []);
    assert.deepEqual(Object.keys(dict.de).filter(k => k.startsWith('jm_')).sort(), Object.keys(dict.en).filter(k => k.startsWith('jm_')).sort(), 'the same keys in both');
  });
  test('German speaks to nobody in particular: no du, no Sie', () => {
    for (const k of Object.keys(dict.de).filter(x => x.startsWith('jm_'))) assert.doesNotMatch(dict.de[k], /\b(du|dein|deine|deinen|dir|dich|Sie|Ihr|Ihre|Ihren|Ihnen)\b/, `${k}: ${dict.de[k]}`);
  });
  test('the window says what the CRM may and may not do with the address, in both languages', () => {
    assert.match(dict.en.jm_signin_hint, /never sees the password/); assert.match(dict.en.jm_signin_hint, /cannot read the mailbox/);
    assert.match(dict.de.jm_signin_hint, /sieht das Passwort nie/); assert.match(dict.de.jm_signin_hint, /kann das Postfach nicht lesen/);
    assert.match(dict.en.jm_send_only, /cannot read the mailbox/); assert.match(dict.de.jm_send_only, /kann das Postfach nicht lesen/);
  });
  test('the limits are explained in both languages: an email over a limit waits and is not lost; whom to write to; how to unsubscribe', () => {
    assert.equal(dict.en.jm_lim_wait, 'An email that would go over a limit waits and goes out as soon as there is room again. It is not lost.');
    assert.equal(dict.de.jm_lim_wait, 'Eine E-Mail, die ein Limit überschreiten würde, wartet und geht hinaus, sobald wieder Platz ist. Verloren geht sie nicht.');
    assert.match(dict.en.jm_lim_advice, /^Only write to people who gave their address for it: reports as spam are what gets an address blocked\./);
    assert.match(dict.en.jm_lim_advice, /has an unsubscribe link and supports Gmail's own "Unsubscribe" button\.$/);
    assert.match(dict.de.jm_lim_advice, /^Nur Menschen anschreiben, die ihre Adresse dafür gegeben haben: Spam-Meldungen sind es, die zur Sperrung einer Adresse führen\./);
    assert.match(dict.de.jm_lim_advice, /enthält einen Abmeldelink und unterstützt Gmails eigene Schaltfläche „Abmelden“\.$/);
    assert.equal(dict.en.jm_pause_what, 'Emails that are due wait and go out afterwards. Nothing is lost.');
    assert.equal(dict.de.jm_pause_what, 'Fällige E-Mails warten und gehen danach hinaus. Nichts geht verloren.');
  });
  test('what Google allows is said with the number the server names, never with one written into a sentence — but for the trial', () => {
    for (const lang of ['en', 'de']) {
      assert.match(dict[lang].jm_lim_google_personal, /\{n\}/); assert.doesNotMatch(dict[lang].jm_lim_google_personal, /\d/);
      assert.match(dict[lang].jm_lim_google_workspace, /\{n\}/); assert.deepEqual(dict[lang].jm_lim_google_workspace.match(/\d+/g), ['500', '500'], 'a trial account: 500, said twice');
      assert.match(dict[lang].jm_err_limits, /\{day\}.*\{person\}/);
    }
  });
});

describe('the button at the top of the journey page', () => {
  test('invites to connect while nothing is connected, and shows the address once one is', () => {
    fill();
    assert.equal(F.journeyMailButtonHtml(), '<button type="button" class="btn btn-secondary btn-sm jm-btn" onclick="openJourneyMail()"><svg class="ic " aria-hidden="true"><use href="#i-mail"/></svg><span class="truncate">Connect email</span></button>');
    fill({ mail: reads(CONNECTED) });
    assert.match(F.journeyMailButtonHtml(), /<span class="truncate">Email: news@firma\.de<\/span>/);
    fill({ lang: 'de', mail: owns(null) });
    assert.match(F.journeyMailButtonHtml(), /<span class="truncate">E-Mail verbinden<\/span>/);
  });
  test('is there before the connection has been read, and after a failed read', () => {
    fill({ mail: null });
    assert.match(F.journeyMailButtonHtml(), /Connect email/);
  });
  test('an address is text', () => {
    fill({ mail: reads({ ...CONNECTED, email: '"><img src=x onerror=alert(1)>@x.de' }) });
    assert.doesNotMatch(F.journeyMailButtonHtml(), /<img/);
    fill({ mail: { ...sends(PAUSED), connection: { ...CONNECTED, email: '"><img src=x onerror=alert(1)>@x.de' } } });
    assert.doesNotMatch(F.journeyMailButtonHtml(), /<img/);
    assert.match(F.journeyMailButtonHtml(), /Email paused: &quot;&gt;&lt;img/);
  });
  test('with limits and nothing paused it is the button it was', () => {
    fill({ mail: sends(PERSONAL) });
    assert.equal(F.journeyMailButtonHtml(), '<button type="button" class="btn btn-secondary btn-sm jm-btn" onclick="openJourneyMail()"><svg class="ic " aria-hidden="true"><use href="#i-mail"/></svg><span class="truncate">Email: news@firma.de</span></button>');
    fill({ mail: sent(400, 40) });
    assert.doesNotMatch(F.journeyMailButtonHtml(), /is-paused|i-alert|title=/, 'a full day is no pause');
  });
  test('while sending is paused it says so, with a warning\'s sign and colour, and until when to the pointer — for owner and member, in the page\'s language', () => {
    fill({ mail: sends(PAUSED) });
    assert.equal(F.journeyMailButtonHtml(), `<button type="button" class="btn btn-secondary btn-sm jm-btn is-paused" title="Sending is paused until ${when(UNTIL, 'en')}" onclick="openJourneyMail()"><svg class="ic " aria-hidden="true"><use href="#i-alert"/></svg><span class="truncate">Email paused: news@firma.de</span></button>`);
    fill({ mail: sends(PAUSED, false) });
    assert.match(F.journeyMailButtonHtml(), /jm-btn is-paused".*Email paused: news@firma\.de/);
    fill({ lang: 'de', mail: sends(PAUSED) });
    assert.match(F.journeyMailButtonHtml(), /<span class="truncate">E-Mail pausiert: news@firma\.de<\/span>/);
    assert.ok(F.journeyMailButtonHtml().includes(`title="Der Versand ist bis ${when(UNTIL, 'de')} pausiert"`));
  });
  test('a pause that is over, has no time or a time nobody can read is none', () => {
    for (const paused_until of ['2020-01-01T00:00:00.000Z', null, undefined, '', 'soon', 4102444800000, {}]) {
      fill({ mail: sends({ ...PAUSED, paused_until }) });
      assert.doesNotMatch(F.journeyMailButtonHtml(), /is-paused|i-alert|paused/, String(paused_until));
      assert.equal(F.journeyMailPausedUntil(), 0, String(paused_until));
    }
    fill({ mail: sends(PAUSED) });
    assert.equal(F.journeyMailPausedUntil(), Date.parse(UNTIL));
    assert.equal(F.journeyMailPausedUntil(Date.parse(UNTIL)), 0, 'at its very end it is over');
    assert.equal(F.journeyMailPausedUntil(Date.parse(UNTIL) - 1), Date.parse(UNTIL));
    fill({ mail: { ...sends(PAUSED), connection: null } });
    assert.equal(F.journeyMailPausedUntil(), 0, 'nothing connected: nothing paused');
  });
});

describe('the window', () => {
  test('nothing connected, owner or admin: one button, "Sign in with Google", and what the sign-in means', () => {
    fill();
    const body = F.journeyMailBodyHtml();
    assert.match(body, /<button type="button" class="btn btn-primary" data-jm-connect>Sign in with Google<\/button>/);
    assert.match(body, /The sign-in happens on Google's own page\. The CRM never sees the password\./);
    assert.doesNotMatch(body, /data-jm-test|data-jm-disconnect|<input|password"/, 'no field to type an address or a password into');
  });
  test('nothing connected, member: who can connect one, and no button', () => {
    fill({ mail: reads(null) });
    const body = F.journeyMailBodyHtml();
    assert.match(body, /No address is connected yet\. An owner or admin can connect one\./);
    assert.doesNotMatch(body, /<button/);
  });
  test('Google sign-in not set up on the server: an owner reads what is missing; a member reads the same as with nothing connected', () => {
    fill({ mail: { configured: false, can_manage: true, connection: null } });
    assert.match(F.journeyMailBodyHtml(), /Google sign-in is not set up on this server yet\. It needs GOOGLE_MAIL_CLIENT_ID and GOOGLE_MAIL_CLIENT_SECRET\./);
    assert.doesNotMatch(F.journeyMailBodyHtml(), /<button/);
    fill({ mail: { configured: false, can_manage: false, connection: null } });
    assert.match(F.journeyMailBodyHtml(), /An owner or admin can connect one\./);
    assert.doesNotMatch(F.journeyMailBodyHtml(), /GOOGLE_MAIL/);
  });
  test('connected, owner or admin: the address, since when and by whom, what the CRM may do, and the three things to do', () => {
    fill({ mail: owns(CONNECTED) });
    const body = F.journeyMailBodyHtml();
    assert.match(body, /<p class="jm-addr">.*<b>news@firma\.de<\/b><\/p>/);
    assert.match(body, /Connected by Olga Owner on 19 Nov 2026\. The CRM may send from this address and cannot read the mailbox\./);
    assert.match(body, /<button type="button" class="btn btn-secondary btn-sm" data-jm-test>Send a test email to me<\/button>/);
    assert.match(body, /<button type="button" class="btn btn-ghost btn-sm" data-jm-connect>Connect another address<\/button>/);
    assert.match(body, /<button type="button" class="btn btn-danger-ghost btn-sm" data-jm-disconnect>Disconnect<\/button>/);
    assert.match(body, /<p class="jm-note" data-jm-note role="status" hidden><\/p>/);
  });
  test('connected, member: the address and the facts, nothing to press', () => {
    fill({ mail: reads(CONNECTED) });
    const body = F.journeyMailBodyHtml();
    assert.match(body, /<b>news@firma\.de<\/b>/);
    assert.doesNotMatch(body, /<button|data-jm-note/);
  });
  test('whoever connected it has left: the date alone', () => {
    fill({ lang: 'de', mail: owns({ ...CONNECTED, connected_by_name: null }) });
    assert.match(F.journeyMailBodyHtml(), /Verbunden am 19\. Nov\.? 2026\. Das CRM darf von dieser Adresse senden/);
  });
  test('an address and a name are text', () => {
    fill({ mail: owns({ ...CONNECTED, email: '<b>x</b>@x.de', connected_by_name: '<script>alert(1)</script>' }) });
    const body = F.journeyMailBodyHtml();
    assert.doesNotMatch(body, /<script|<b>x/);
    assert.match(body, /&lt;b&gt;x&lt;\/b&gt;@x\.de/);
  });
  test('opens once: a second call gives the open window back; closing it lets it open again', () => {
    fill({ mail: owns(CONNECTED) });
    const first = F.openJourneyMail();
    assert.equal(F.openJourneyMail(), first);
    assert.equal(F.__page().log.filter(c => c[0] === 'modal').length, 1);
    const opts = F.__page().log.find(c => c[0] === 'modal')[1];
    assert.equal(opts.title, 'Email connection');
    assert.equal(opts.footer, '<button class="btn btn-secondary" data-close>Close</button>');
    first.close();
    assert.equal(F.__state().open, false);
    F.openJourneyMail();
    assert.equal(F.__page().log.filter(c => c[0] === 'modal').length, 2);
  });
  test('opens with the cursor at its top — not in the first limit, which a window would choose by itself', () => {
    fill({ mail: sends(PERSONAL) });
    F.openJourneyMail();
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'focus'), [['focus', '[data-close]']]);
    assert.match(sliceFn(core, 'uiOverlay', 'core.js'), /\$\('\[autofocus\]', ov\) \|\| \$\('input:not\(\[type=hidden\]\),select,textarea', \$\('\.modal-body', ov\)\)/, 'a window gives the cursor to its first field');
  });
});

describe('sending limits: what the window shows', () => {
  test('a server that says nothing about sending, or something that is no such answer: the window is as it was', () => {
    const plain = (fill({ mail: owns(CONNECTED) }), F.journeyMailBodyHtml());
    assert.doesNotMatch(plain, /jm-part|jm-meter|jm-pause|data-jm-limit/);
    const broken = [undefined, null, 'x', 7, [], {}, { ...PERSONAL, limits: undefined }, { ...PERSONAL, defaults: null }, { ...PERSONAL, max: undefined }, { ...PERSONAL, sent: undefined },
      { ...PERSONAL, limits: { ...PERSONAL.limits, day: 0 } }, { ...PERSONAL, limits: { ...PERSONAL.limits, hour: '40' } }, { ...PERSONAL, limits: { day: 400, hour: 40 } }, { ...PERSONAL, limits: { ...PERSONAL.limits, person: 2.5 } },
      { ...PERSONAL, defaults: { ...PERSONAL.defaults, person: -1 } }, { ...PERSONAL, max: { ...PERSONAL.max, day: null } }, { ...PERSONAL, sent: { day: -1, hour: 0 } }, { ...PERSONAL, sent: { day: 3 } },
      { ...PERSONAL, sent: { day: 3, hour: 1.5 } }, { ...PERSONAL, google_day: undefined }, { ...PERSONAL, google_day: 0 }, { ...PERSONAL, google_day: '500' }];
    for (const sending of broken) {
      fill({ mail: sends(sending) });
      assert.equal(F.journeyMailSending(), null, JSON.stringify(sending));
      assert.equal(F.journeyMailBodyHtml(), plain, JSON.stringify(sending));
      assert.match(F.journeyMailButtonHtml(), /Email: news@firma\.de/);
    }
    fill({ mail: { ...owns(null), sending: PERSONAL } });
    assert.equal(F.journeyMailSending(), null, 'nothing connected: nothing about sending');
    assert.doesNotMatch(F.journeyMailBodyHtml(), /jm-part/);
    fill({ mail: sends(PERSONAL) });
    assert.equal(F.journeyMailSending(), F.__state().journeyMail.sending);
    fill({ mail: sends({ ...PERSONAL, sent: { day: 0, hour: 0 } }) });
    assert.ok(F.journeyMailSending(), 'nothing sent yet is an answer');
  });
  test('owner or admin, a Gmail address: how much went out, the three limits as fields, what Google allows, and the two buttons', () => {
    fill({ mail: sends(PERSONAL) });
    const body = F.journeyMailBodyHtml();
    assert.match(body, /<section class="jm-part" aria-label="Sending limits">\s*<h3 class="jm-part-title">Sending limits<\/h3>/);
    assert.ok(body.includes('<div class="jm-sent"><p class="jm-sent-line"><span>Sent in the last 24 hours</span><b>37 of 400</b></p><div class="jm-meter" role="meter" aria-label="Sent in the last 24 hours" aria-valuemin="0" aria-valuemax="400" aria-valuenow="37" aria-valuetext="37 of 400"><span style="width:9%"></span></div></div>'));
    assert.ok(body.includes('<div class="jm-sent"><p class="jm-sent-line"><span>In the last hour</span><b>5 of 40</b></p><div class="jm-meter" role="meter" aria-label="In the last hour" aria-valuemin="0" aria-valuemax="40" aria-valuenow="5" aria-valuetext="5 of 40"><span style="width:13%"></span></div></div>'));
    assert.ok(body.includes('<div class="jm-limit"><label class="label" for="jm-limit-day">Per day</label><input class="input" id="jm-limit-day" type="number" min="1" max="500" step="1" inputmode="numeric" autocomplete="off" aria-describedby="jm-limit-day-hint" data-jm-limit="day" value="400"><p class="help" id="jm-limit-day-hint">Google allows 500 emails a day for a Gmail address. The CRM does not go above it.</p></div>'));
    assert.ok(body.includes('<div class="jm-limit"><label class="label" for="jm-limit-hour">Per hour</label><input class="input" id="jm-limit-hour" type="number" min="1" max="500" step="1" inputmode="numeric" autocomplete="off" aria-describedby="jm-limit-hour-hint" data-jm-limit="hour" value="40"><p class="help" id="jm-limit-hour-hint">Spreads the emails over the day instead of sending them all at once. At most the daily limit.</p></div>'));
    assert.ok(body.includes('<div class="jm-limit"><label class="label" for="jm-limit-person">Per person per day</label><input class="input" id="jm-limit-person" type="number" min="1" max="20" step="1" inputmode="numeric" autocomplete="off" aria-describedby="jm-limit-person-hint" data-jm-limit="person" value="3"><p class="help" id="jm-limit-person-hint">The most emails one person gets in a day, so that nobody is written to too often.</p></div>'));
    assert.deepEqual([...body.matchAll(/data-jm-limit="([a-z]+)"/g)].map(m => m[1]), ['day', 'hour', 'person'], 'in this order');
    assert.match(body, /<button type="button" class="btn btn-primary btn-sm" data-jm-limits-save>Save limits<\/button>\s*<button type="button" class="btn btn-ghost btn-sm" data-jm-limits-defaults>Back to the recommended values<\/button>/);
    assert.match(body, /<p class="jm-note" data-jm-limits-note role="status" hidden><\/p>/);
    assert.match(body, /<p class="help">An email that would go over a limit waits and goes out as soon as there is room again\. It is not lost\.<\/p>\s*<p class="help">Only write to people who gave their address for it: reports as spam are what gets an address blocked\. Every workflow email has an unsubscribe link and supports Gmail's own &quot;Unsubscribe&quot; button\.<\/p>/);
    assert.doesNotMatch(body, /is-near|jm-sent-full|jm-pause|data-jm-resume/);
    assert.ok(body.indexOf('class="jm-addr"') < body.indexOf('data-jm-test') && body.indexOf('data-jm-note') < body.indexOf('class="jm-part"'), 'the address and its buttons first, the limits under them');
    assert.equal(count(body, '<section'), 1); assert.equal(count(body, '</section>'), 1);
  });
  test('a member reads the same numbers and can change nothing', () => {
    fill({ mail: sends(PERSONAL, false) });
    const body = F.journeyMailBodyHtml();
    assert.doesNotMatch(body, /<button|<input|<label|data-jm-note|data-jm-limits-note|data-jm-limit=/);
    assert.ok(body.includes('<b>37 of 400</b>') && body.includes('<b>5 of 40</b>'));
    assert.ok(body.includes('<div class="jm-limit"><span class="label">Per day</span><b>400</b><p class="help" id="jm-limit-day-hint">Google allows 500 emails a day for a Gmail address. The CRM does not go above it.</p></div>'));
    assert.ok(body.includes('<span class="label">Per hour</span><b>40</b>') && body.includes('<span class="label">Per person per day</span><b>3</b>'));
    assert.match(body, /It is not lost\./); assert.match(body, /Only write to people who gave their address for it/);
  });
  test('a Google Workspace address: its own limit from Google, with the trial; numbers as the language writes them', () => {
    fill({ mail: sends(WORKSPACE) });
    const body = F.journeyMailBodyHtml();
    assert.ok(body.includes('<p class="help" id="jm-limit-day-hint">Google allows 2,000 emails a day for a Google Workspace address, and 500 while the account is a trial. The CRM does not go above it. For a trial account, set this limit below 500.</p>'));
    assert.doesNotMatch(body, /for a Gmail address/);
    assert.ok(body.includes('<b>1,234 of 1,500</b>') && body.includes('aria-valuemax="1500" aria-valuenow="1234" aria-valuetext="1,234 of 1,500"'), 'words with the thousands apart, the meter\'s numbers plain');
    assert.ok(body.includes('id="jm-limit-day" type="number" min="1" max="2000"') && body.includes('id="jm-limit-hour" type="number" min="1" max="2000"') && body.includes('id="jm-limit-person" type="number" min="1" max="20"'));
    assert.ok(body.includes('data-jm-limit="day" value="1500"') && body.includes('data-jm-limit="hour" value="150"'), 'a field holds a plain number');
    fill({ mail: sends(WORKSPACE, false) });
    assert.ok(F.journeyMailBodyHtml().includes('<span class="label">Per day</span><b>1,500</b>'));
    fill({ lang: 'de', mail: sends(WORKSPACE, false) });
    const de = F.journeyMailBodyHtml();
    assert.ok(de.includes('<b>1.234 von 1.500</b>') && de.includes('<span class="label">Pro Tag</span><b>1.500</b>'));
    assert.ok(de.includes('Google erlaubt für eine Google-Workspace-Adresse 2.000 E-Mails am Tag, und 500, solange das Konto ein Testkonto ist. Das CRM geht nicht darüber hinaus. Für ein Testkonto dieses Limit unter 500 setzen.'));
    assert.equal(F.journeyMailCount(2000), '2.000');
    fill({ mail: sends({ ...WORKSPACE, kind: 'something new' }) });
    assert.match(F.journeyMailBodyHtml(), /for a Google Workspace address/, 'a kind nobody knows is not called a Gmail address');
  });
  test('in German', () => {
    fill({ lang: 'de', mail: sends(PERSONAL) });
    const body = F.journeyMailBodyHtml();
    assert.match(body, /<h3 class="jm-part-title">Versandlimits<\/h3>/);
    assert.ok(body.includes('<span>In den letzten 24 Stunden gesendet</span><b>37 von 400</b>') && body.includes('<span>In der letzten Stunde</span><b>5 von 40</b>'));
    assert.ok(body.includes('>Pro Tag</label>') && body.includes('>Pro Stunde</label>') && body.includes('>Pro Person pro Tag</label>'));
    assert.ok(body.includes('Google erlaubt für eine Gmail-Adresse 500 E-Mails am Tag. Das CRM geht nicht darüber hinaus.'));
    assert.ok(body.includes('data-jm-limits-save>Limits speichern</button>') && body.includes('data-jm-limits-defaults>Zurück zu den empfohlenen Werten</button>'));
    assert.ok(body.includes('Verloren geht sie nicht.') && body.includes('Schaltfläche „Abmelden“.'));
  });
  test('nothing sent yet: empty meters; the first email already shows', () => {
    fill({ mail: sent(0, 0) });
    const body = F.journeyMailBodyHtml();
    assert.ok(body.includes('<b>0 of 400</b>') && body.includes('aria-valuenow="0" aria-valuetext="0 of 400"><span style="width:0%"></span>'));
    assert.ok(body.includes('<b>0 of 40</b>') && body.includes('aria-valuenow="0" aria-valuetext="0 of 40"><span style="width:0%"></span>'));
    assert.doesNotMatch(body, /is-near|jm-sent-full/);
    assert.match(F.journeyMailMeterHtml('jm_lim_sent_day', 1, 400), /<b>1 of 400<\/b>.*aria-valuenow="1".*<span style="width:2%"><\/span>/, 'a sliver, not nothing');
    assert.match(F.journeyMailMeterHtml('jm_lim_sent_day', 200, 400), /<span style="width:50%"><\/span>/);
  });
  test('near a limit its meter has the colour of a warning: from four fifths on', () => {
    assert.match(js, /^const JOURNEY_MAIL_NEAR = 0\.8;/m);
    fill();
    const near = (n, max) => / is-near"/.test(F.journeyMailMeterHtml('jm_lim_sent_day', n, max));
    assert.deepEqual([near(319, 400), near(320, 400), near(321, 400), near(400, 400), near(0, 400), near(31, 40), near(32, 40), near(4, 5), near(1, 1)], [false, true, true, true, false, false, true, true, true]);
    assert.match(F.journeyMailMeterHtml('jm_lim_sent_day', 320, 400), /<div class="jm-meter is-near" role="meter".*<span style="width:80%"><\/span>/);
    fill({ mail: sent(330, 5) });
    const body = F.journeyMailBodyHtml();
    assert.equal(count(body, 'jm-meter is-near'), 1, 'the day is near its limit, the hour is not');
    assert.ok(body.indexOf('jm-meter is-near') < body.indexOf('In the last hour'));
    assert.doesNotMatch(body, /jm-sent-full/, 'near is not full');
  });
  test('at a limit, and over it: a full meter and what that means; the words keep the true number', () => {
    fill({ mail: sent(400, 5) });
    let body = F.journeyMailBodyHtml();
    assert.ok(body.includes('<b>400 of 400</b>') && body.includes('aria-valuenow="400" aria-valuetext="400 of 400"><span style="width:100%"></span></div><p class="jm-sent-full">Limit reached. Further emails wait until there is room again.</p></div>'));
    assert.equal(count(body, 'jm-sent-full'), 1);
    fill({ mail: sent(37, 40) });
    body = F.journeyMailBodyHtml();
    assert.equal(count(body, 'jm-sent-full'), 1);
    assert.ok(body.indexOf('In the last hour') < body.indexOf('jm-sent-full'), 'said under the meter that is full');
    fill({ mail: sent(450, 60) });
    body = F.journeyMailBodyHtml();
    assert.ok(body.includes('<b>450 of 400</b>') && body.includes('aria-valuemax="400" aria-valuenow="400" aria-valuetext="450 of 400"><span style="width:100%"></span>'), 'a meter never runs over');
    assert.equal(count(body, 'jm-sent-full'), 2);
    fill({ lang: 'de', mail: sent(400, 5) });
    assert.ok(F.journeyMailBodyHtml().includes('<p class="jm-sent-full">Limit erreicht. Weitere E-Mails warten, bis wieder Platz ist.</p>'));
    assert.match(F.journeyMailMeterHtml('jm_lim_sent_day', 399, 400), /<span style="width:100%"><\/span><\/div><\/div>$/, 'one below the limit is not full');
  });
});

describe('saving the limits', () => {
  const save = async () => { const btn = { disabled: false }; await F.__page().handlers['click [data-jm-limits-save]']({}, btn); return btn; };
  const puts = () => F.__page().log.filter(c => c[0] === 'put');
  test('"Save limits" sends the three numbers once, and the window shows what the server answers', async () => {
    const answer = sends({ ...PERSONAL, limits: { day: 300, hour: 30, person: 2 } });
    fill({ mail: sends(PERSONAL), answers: { 'put /api/journey/mail/limits': answer } });
    F.openJourneyMail();
    type({ day: '300', hour: '30', person: '2' });
    const btn = await save();
    const p = F.__page();
    assert.deepEqual(puts(), [['put', '/api/journey/mail/limits', { day: 300, hour: 30, person: 2 }]]);
    assert.equal(F.__state().journeyMail, answer);
    assert.deepEqual(held(), { day: '300', hour: '30', person: '2' });
    assert.ok(p.body.innerHTML.includes('<b>37 of 300</b>') && p.body.innerHTML.includes('<b>5 of 30</b>'), 'the meters measure against the new limits');
    assert.deepEqual(p.log.filter(c => c[0] === 'toast'), [['toast', 'Limits saved.']]);
    assert.ok(p.log.some(c => c[0] === 'renderJourney'));
    assert.deepEqual([btn.disabled, p.limitsNote.hidden], [false, true]);
  });
  test('while the limits are on their way the button cannot be pressed again', async () => {
    fill({ mail: sends(PERSONAL) });
    F.openJourneyMail();
    const btn = { disabled: false }, seen = [];
    F.__opt('answers', { 'put /api/journey/mail/limits': () => { seen.push(btn.disabled); return sends(PERSONAL); } });
    type({ day: '300' });
    await F.__page().handlers['click [data-jm-limits-save]']({}, btn);
    assert.deepEqual([seen, btn.disabled], [[true], false]);
    await assert.doesNotReject(F.saveJourneyMailLimits(), 'pressed by something that names no button: sent all the same');
    assert.equal(puts().length, 2);
  });
  test('a field that holds the recommended value is sent as "the default"', async () => {
    const was = sends({ ...PERSONAL, limits: { day: 300, hour: 30, person: 5 } });
    for (const [typed, body] of [[{}, { day: 300, hour: 30, person: 5 }], [{ day: '400' }, { day: null, hour: 30, person: 5 }], [{ day: '400', hour: '40', person: '3' }, { day: null, hour: null, person: null }],
      [{ day: ' 250 ', hour: '040', person: '3' }, { day: 250, hour: null, person: null }], [{ day: '500', hour: '500', person: '20' }, { day: 500, hour: 500, person: 20 }], [{ day: '1', hour: '1', person: '1' }, { day: 1, hour: 1, person: 1 }]]) {
      fill({ mail: was, answers: { 'put /api/journey/mail/limits': was } });
      F.openJourneyMail();
      type(typed);
      await save();
      assert.deepEqual(puts(), [['put', '/api/journey/mail/limits', body]], JSON.stringify(typed));
    }
    fill({ lang: 'de', mail: sends(WORKSPACE), answers: { 'put /api/journey/mail/limits': sends(WORKSPACE) } });
    F.openJourneyMail();
    type({ day: '2000', hour: '150', person: '4' });
    await save();
    assert.deepEqual(puts(), [['put', '/api/journey/mail/limits', { day: 2000, hour: null, person: 4 }]], 'the recommended values are those of the address');
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', 'Limits gespeichert.']]);
  });
  test('what is no whole number in its range is not sent: the ranges are said under the fields, and the field is marked and given the cursor', async () => {
    for (const [typed, part] of [[{ day: '' }, 'day'], [{ day: '0' }, 'day'], [{ day: '-5' }, 'day'], [{ day: '501' }, 'day'], [{ day: '1.5' }, 'day'], [{ day: 'abc' }, 'day'], [{ day: '1e2' }, 'day'], [{ day: '0x10' }, 'day'],
      [{ day: '123456' }, 'day'], [{ hour: '' }, 'hour'], [{ hour: '0' }, 'hour'], [{ hour: '401' }, 'hour'], [{ day: '30' }, 'hour'], [{ day: '30', hour: '31' }, 'hour'], [{ person: '0' }, 'person'], [{ person: '21' }, 'person'],
      [{ person: '2,5' }, 'person'], [{ person: '' }, 'person'], [{ day: '900', hour: '0', person: '99' }, 'day'], [{ hour: '0', person: '99' }, 'hour']]) {
      fill({ mail: sends(PERSONAL), answers: { 'put /api/journey/mail/limits': sends(PERSONAL) } });
      F.openJourneyMail();
      type(typed);
      F.__page().log.length = 0;
      const btn = await save();
      const p = F.__page();
      assert.deepEqual(puts(), [], JSON.stringify(typed));
      assert.deepEqual([p.limitsNote.textContent, p.limitsNote.hidden, p.limitsNote.bad, btn.disabled], [RANGES, false, true, false], JSON.stringify(typed));
      assert.equal(p.note.textContent, '', 'not on the line under the address');
      assert.deepEqual(held(), { day: '400', hour: '40', person: '3', ...typed }, 'what was typed stays');
      assert.deepEqual(marked(), [part], `${JSON.stringify(typed)}: the first field that is out of its range, and only that one`);
      assert.deepEqual(p.log.filter(c => c[0] === 'focus'), [['focus', `[data-jm-limit="${part}"]`]], JSON.stringify(typed));
    }
    fill({ mail: sends(PERSONAL), answers: { 'put /api/journey/mail/limits': sends(PERSONAL) } });
    F.openJourneyMail();
    type({ day: '30', hour: '30' });
    await save();
    assert.deepEqual(puts(), [['put', '/api/journey/mail/limits', { day: 30, hour: 30, person: null }]], 'per hour may be as much as per day');
  });
  test('the ranges are the server\'s, in the page\'s language', async () => {
    fill({ lang: 'de', mail: sends(WORKSPACE) });
    F.openJourneyMail();
    type({ day: '2001' });
    await save();
    assert.equal(F.__page().limitsNote.textContent, 'Die Limits sind ganze Zahlen: pro Tag von 1 bis 2.000, pro Stunde von 1 bis zum Tageslimit, pro Person pro Tag von 1 bis 20.');
    fill({ mail: sends({ ...WORKSPACE, max: { day: 1800, hour: 1800, person: 9 } }) });
    assert.equal(F.journeyMailErrorText({ code: 'limits' }), 'The limits are whole numbers: per day from 1 to 1,800, per hour from 1 up to the daily limit, per person per day from 1 to 9.');
  });
  test('pure: the bounds of each limit', () => {
    const of = (day, hour, person, s = PERSONAL) => { const out = F.journeyMailLimitsOf({ day, hour, person }, s); return out.error ? 'no' : out.body; };
    assert.deepEqual([F.journeyMailLimitsOf({ day: '0', hour: '0', person: '0' }, PERSONAL), F.journeyMailLimitsOf({ day: '400', hour: '0', person: '0' }, PERSONAL), F.journeyMailLimitsOf({ day: '400', hour: '40', person: '0' }, PERSONAL)],
      [{ error: true, part: 'day' }, { error: true, part: 'hour' }, { error: true, part: 'person' }], 'the first field that is wrong is the one to go to');
    assert.deepEqual(of('500', '500', '20'), { day: 500, hour: 500, person: 20 });
    assert.equal(of('501', '40', '3'), 'no'); assert.equal(of('0', '40', '3'), 'no');
    assert.deepEqual(of('100', '100', '3'), { day: 100, hour: 100, person: null }); assert.equal(of('100', '101', '3'), 'no');
    assert.equal(of('400', '40', '21'), 'no'); assert.equal(of('400', '40', '0'), 'no');
    assert.deepEqual(of(300, 30, 2), { day: 300, hour: 30, person: 2 }, 'numbers as well as what a field holds');
    assert.equal(of(undefined, '40', '3'), 'no'); assert.equal(of(null, '40', '3'), 'no'); assert.equal(of('400', '40', undefined), 'no');
    assert.equal(of('٤٠٠', '40', '3'), 'no', 'digits of another script are not read');
    const tight = { ...WORKSPACE, max: { day: 2000, hour: 100, person: 20 } };
    assert.equal(of('1500', '101', '3', tight), 'no', 'per hour never above what the server allows per hour');
    assert.deepEqual(of('1500', '100', '3', tight), { day: null, hour: 100, person: null });
  });
  test('the server\'s refusal, and a request that never arrived: said under the fields, nothing changed', async () => {
    for (const [answer, sentence] of [[{ error: 'x', code: 'limits' }, RANGES], [{ error: 'Owner or admin only', code: 'forbidden' }, 'Only owners and admins can connect the email address.'],
      [{ error: 'x', code: 'not_connected' }, 'No address is connected.'], [{ error: 'Internal server error' }, 'That did not work. Please try again.'], [{ error: 'x', code: 'toString' }, 'That did not work. Please try again.'],
      [undefined, 'That did not work. Please try again.'], [null, 'That did not work. Please try again.']]) {
      fill({ mail: sends(PERSONAL), answers: { 'put /api/journey/mail/limits': answer } });
      F.openJourneyMail();
      const before = F.__state().journeyMail;
      type({ day: '300' });
      const btn = await save();
      const p = F.__page();
      assert.equal(puts().length, 1);
      assert.deepEqual([p.limitsNote.textContent, p.limitsNote.bad, btn.disabled], [sentence, true, false], JSON.stringify(answer));
      assert.equal(F.__state().journeyMail, before);
      assert.equal(held().day, '300', 'what was typed stays for another try');
      assert.ok(!p.log.some(c => c[0] === 'toast'));
    }
    fill({ mail: sends(PERSONAL) });
    F.openJourneyMail(); await tick(); F.__opt('throw', true);
    await assert.doesNotReject(save());
    assert.deepEqual([F.__page().limitsNote.textContent, F.__page().limitsNote.bad], ['That did not work. Please try again.', true]);
  });
  test('typing takes an old message and the mark away; so does the next try, which marks what is wrong then', async () => {
    fill({ mail: sends(PERSONAL), answers: { 'put /api/journey/mail/limits': sends({ ...PERSONAL, limits: { day: 300, hour: 40, person: 3 } }) } });
    F.openJourneyMail();
    type({ day: '0' });
    await save();
    assert.deepEqual([F.__page().limitsNote.hidden, marked()], [false, ['day']]);
    F.__page().handlers['input [data-jm-limit]']();
    assert.deepEqual([F.__page().limitsNote.textContent, F.__page().limitsNote.hidden, F.__page().limitsNote.bad, marked()], ['', true, false, []]);
    type({ day: '0' });
    await save();
    type({ day: '300', person: '0' });
    await save();
    assert.deepEqual(marked(), ['person'], 'the day is right now: its mark is gone');
    type({ person: '3' });
    await save();
    assert.deepEqual([puts().length, marked(), held().day], [1, [], '300'], 'saved: nothing is marked');
    assert.match(css, /^\.input\[aria-invalid="true"\] \{ border-color: var\(--danger\); \}/m, 'a marked field has the colour of a problem');
  });
  test('the server\'s refusal marks no field: it names none', async () => {
    fill({ mail: sends(PERSONAL), answers: { 'put /api/journey/mail/limits': { error: 'x', code: 'limits' } } });
    F.openJourneyMail();
    type({ day: '300' });
    F.__page().log.length = 0;
    await save();
    assert.deepEqual([F.__page().limitsNote.textContent, marked(), F.__page().log.filter(c => c[0] === 'focus')], [RANGES, [], []]);
    // a mark from the try before does not outlive a try the page itself finds right
    type({ day: '0' });
    await save();
    assert.deepEqual(marked(), ['day']);
    type({ day: '300' });
    await save();
    assert.deepEqual([puts().length, marked(), F.__page().limitsNote.textContent], [2, [], RANGES]);
  });
  test('Enter in a limit saves by pressing the button — through its one-press lock; any other key is left alone', () => {
    fill({ mail: sends(PERSONAL) });
    F.openJourneyMail();
    F.__page().log.length = 0;
    const key = k => { const e = { key: k, prevented: false, preventDefault() { e.prevented = true; } }; F.__page().handlers['keydown [data-jm-limit]'](e); return e.prevented; };
    assert.deepEqual([key('5'), key('Tab'), key('Escape'), key(' ')], [false, false, false, false]);
    assert.deepEqual(F.__page().log, []);
    assert.equal(key('Enter'), true);
    assert.deepEqual(F.__page().log, [['click', '[data-jm-limits-save]']]);
    assert.match(core, /^const SAVE_BUTTONS = 'button\.btn-primary, button\[type="submit"\]';$/m, 'the lock is on primary buttons …');
    assert.match(sliceFn(js, 'journeyMailLimitsHtml', 'journey-mail.js'), /class="btn btn-primary btn-sm" data-jm-limits-save/, '… which "Save limits" is');
  });
  test('a member cannot save, whatever calls it', async () => {
    fill({ mail: sends(PERSONAL, false), answers: { 'put /api/journey/mail/limits': sends(PERSONAL) } });
    F.openJourneyMail();
    await F.saveJourneyMailLimits({ disabled: false });
    assert.deepEqual(puts(), []);
    fill({ mail: owns(CONNECTED) });
    F.openJourneyMail();
    await assert.doesNotReject(F.saveJourneyMailLimits({ disabled: false }));
    assert.deepEqual(puts(), [], 'nor is anything sent while the server says nothing about sending');
    fill({ mail: sends(PERSONAL) });
    await assert.doesNotReject(F.saveJourneyMailLimits(null));
    assert.deepEqual(puts(), [], 'nor without the window');
    // the fields are still on the screen, but the page has learnt that this person may no longer change them
    fill({ mail: sends(PERSONAL), answers: { 'put /api/journey/mail/limits': sends(PERSONAL) } });
    F.openJourneyMail();
    type({ day: '300' });
    F.__set('journeyMail', sends(PERSONAL, false));
    await save();
    assert.deepEqual(puts(), [], 'what the page knows decides, not what is drawn');
  });
  test('"Back to the recommended values" puts them into the fields and saves nothing; "Save limits" then sends them as the default', async () => {
    const was = sends({ ...PERSONAL, limits: { day: 300, hour: 30, person: 5 } });
    fill({ mail: was, answers: { 'put /api/journey/mail/limits': sends(PERSONAL) } });
    F.openJourneyMail();
    type({ day: '0' });
    await save();
    assert.equal(F.__page().limitsNote.hidden, false);
    assert.deepEqual(marked(), ['day']);
    F.__page().handlers['click [data-jm-limits-defaults]']();
    assert.deepEqual(held(), { day: '400', hour: '40', person: '3' });
    assert.deepEqual([F.__page().limitsNote.textContent, F.__page().limitsNote.hidden, marked()], ['', true, []], 'an old message and its mark go');
    assert.deepEqual(puts(), []);
    assert.equal(F.__state().journeyMail, was, 'nothing is saved yet');
    await save();
    assert.deepEqual(puts(), [['put', '/api/journey/mail/limits', { day: null, hour: null, person: null }]]);
    fill({ mail: sends(WORKSPACE) });
    F.openJourneyMail();
    type({ day: '5', hour: '5', person: '5' });
    F.journeyMailDefaults();
    assert.deepEqual(held(), { day: '1500', hour: '150', person: '3' }, 'those of a Google Workspace address');
    fill({ mail: sends(PERSONAL) });
    assert.doesNotThrow(() => F.journeyMailDefaults(), 'without the window nothing happens');
  });
});

describe('sending is paused', () => {
  test('a notice at the top of the window: until when, what Google said, what it means, and "Send again now"', () => {
    fill({ mail: sends(PAUSED) });
    const body = F.journeyMailBodyHtml();
    assert.match(body, /^<div class="jm">\s*<div class="jm-pause" role="status">/, 'before everything else');
    assert.ok(body.includes(`<p class="jm-pause-title"><svg class="ic " aria-hidden="true"><use href="#i-alert"/></svg><span>Sending is paused until ${when(UNTIL, 'en')}</span></p>`));
    assert.ok(body.includes('<p class="jm-pause-detail">Google answered: Daily user sending limit exceeded</p>'));
    assert.ok(body.includes('<p class="help">Emails that are due wait and go out afterwards. Nothing is lost.</p>'));
    assert.ok(body.includes('<div class="jm-actions"><button type="button" class="btn btn-secondary btn-sm" data-jm-resume>Send again now</button></div>'));
    assert.ok(body.indexOf('class="jm-pause"') < body.indexOf('class="jm-addr"') && body.indexOf('data-jm-resume') < body.indexOf('class="jm-addr"'));
    assert.match(body, /class="jm-part"/, 'the limits stay under it');
    assert.equal(count(body, 'jm-pause"'), 1);
  });
  test('its time is written as the page\'s language writes a moment', () => {
    assert.notEqual(when(UNTIL, 'en'), when(UNTIL, 'de'));
    assert.match(when(UNTIL, 'en'), /Mar 2099/); assert.match(when(UNTIL, 'de'), /03\.2099/);
    fill({ lang: 'de', mail: sends(PAUSED) });
    const body = F.journeyMailBodyHtml();
    assert.ok(body.includes(`<span>Der Versand ist bis ${when(UNTIL, 'de')} pausiert</span>`));
    assert.ok(body.includes('Google hat geantwortet: Daily user sending limit exceeded') && body.includes('Fällige E-Mails warten und gehen danach hinaus. Nichts geht verloren.') && body.includes('data-jm-resume>Jetzt wieder senden</button>'));
    assert.match(sliceFn(js, 'journeyMailPauseHtml', 'journey-mail.js'), /journeyWhen\(until\)/);
  });
  test('a member reads the notice and has nothing to press', () => {
    fill({ mail: sends(PAUSED, false) });
    const body = F.journeyMailBodyHtml();
    assert.match(body, /Sending is paused until/); assert.match(body, /Google answered: Daily user sending limit exceeded/); assert.match(body, /Nothing is lost\./);
    assert.doesNotMatch(body, /<button|data-jm-resume/);
  });
  test('without Google\'s own words the reason is said plainly; without a reason nothing is made up', () => {
    fill({ mail: sends({ ...PAUSED, pause_detail: null }) });
    assert.ok(F.journeyMailBodyHtml().includes('<p class="jm-pause-detail">Google reported that this address has reached its sending limit.</p>'));
    fill({ lang: 'de', mail: sends({ ...PAUSED, pause_detail: '' }) });
    assert.ok(F.journeyMailBodyHtml().includes('<p class="jm-pause-detail">Google hat gemeldet, dass diese Adresse ihr Sendelimit erreicht hat.</p>'));
    for (const pause_reason of [null, undefined, 'something new']) {
      fill({ mail: sends({ ...PAUSED, pause_detail: null, pause_reason }) });
      const body = F.journeyMailBodyHtml();
      assert.match(body, /Sending is paused until/); assert.doesNotMatch(body, /jm-pause-detail|Google answered|Google reported/);
    }
  });
  test('Google\'s words are text', () => {
    fill({ mail: sends({ ...PAUSED, pause_detail: '<img src=x onerror=alert(1)> "Quota" & <b>more</b>' }) });
    const body = F.journeyMailBodyHtml();
    assert.doesNotMatch(body, /<img|<b>more/);
    assert.ok(body.includes('Google answered: &lt;img src=x onerror=alert(1)&gt; &quot;Quota&quot; &amp; &lt;b&gt;more&lt;/b&gt;'));
  });
  test('nothing paused, or a pause that is over: no notice', () => {
    for (const sending of [PERSONAL, { ...PAUSED, paused_until: '2020-01-01T00:00:00.000Z' }, { ...PAUSED, paused_until: null }, { ...PAUSED, paused_until: 'soon' }]) {
      fill({ mail: sends(sending) });
      assert.doesNotMatch(F.journeyMailBodyHtml(), /jm-pause|data-jm-resume/, JSON.stringify(sending.paused_until));
    }
    fill({ mail: sends(PAUSED) });
    assert.equal(F.journeyMailPauseHtml(Date.parse(UNTIL) + 1), '', 'drawn after its end it is gone');
    assert.match(F.journeyMailPauseHtml(Date.parse(UNTIL) - 1), /jm-pause/);
  });

  const resume = () => F.__page().handlers['click [data-jm-resume]']();
  test('"Send again now" asks first; "no" sends nothing', async () => {
    fill({ mail: sends(PAUSED), answers: { 'post /api/journey/mail/resume': sends(PERSONAL) } });
    F.openJourneyMail();
    const before = F.__state().journeyMail;
    F.__opt('confirm', false);
    await resume();
    const log = F.__page().log, asked = log.filter(c => c[0] === 'confirm');
    assert.equal(asked.length, 1);
    assert.deepEqual([asked[0][1].title, asked[0][1].message, asked[0][1].confirmLabel],
      ['Send again now?', 'The pause protects the address: Google has limited it. Sending on before Google allows it again can get the address blocked for longer.', 'Send again now']);
    assert.ok(!log.some(c => c[0] === 'post'));
    assert.equal(F.__state().journeyMail, before);
    assert.match(F.__page().body.innerHTML, /jm-pause/);
  });
  test('"yes": the server lifts the pause; the notice goes, the page\'s button is drawn again, and it is said', async () => {
    const answer = sends(PERSONAL);
    fill({ mail: sends(PAUSED), answers: { 'post /api/journey/mail/resume': answer } });
    F.openJourneyMail();
    await resume();
    const p = F.__page();
    assert.deepEqual(p.log.filter(c => c[0] === 'post'), [['post', '/api/journey/mail/resume', {}]]);
    assert.ok(p.log.findIndex(c => c[0] === 'confirm') < p.log.findIndex(c => c[0] === 'post'), 'asked before it is sent');
    assert.equal(F.__state().journeyMail, answer);
    assert.doesNotMatch(p.body.innerHTML, /jm-pause|data-jm-resume/);
    assert.ok(p.log.some(c => c[0] === 'renderJourney'));
    assert.deepEqual(p.log.filter(c => c[0] === 'toast'), [['toast', 'Sending is on again.']]);
    assert.doesNotMatch(F.journeyMailButtonHtml(), /is-paused/);
    fill({ lang: 'de', mail: sends(PAUSED), answers: { 'post /api/journey/mail/resume': answer } });
    F.openJourneyMail();
    await resume();
    const asked = F.__page().log.find(c => c[0] === 'confirm')[1];
    assert.deepEqual([asked.title, asked.confirmLabel], ['Jetzt wieder senden?', 'Jetzt wieder senden']);
    assert.match(asked.message, /^Die Pause schützt die Adresse: Google hat sie begrenzt\./);
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'toast'), [['toast', 'Der Versand läuft wieder.']]);
  });
  test('a refusal or a request that never arrived: said in the window, the pause stays shown', async () => {
    fill({ mail: sends(PAUSED), answers: { 'post /api/journey/mail/resume': { error: 'Owner or admin only', code: 'forbidden' } } });
    F.openJourneyMail();
    const before = F.__state().journeyMail;
    await resume();
    assert.deepEqual([F.__page().note.textContent, F.__page().note.bad, F.__page().note.hidden], ['Only owners and admins can connect the email address.', true, false]);
    assert.equal(F.__state().journeyMail, before);
    assert.match(F.__page().body.innerHTML, /jm-pause/);
    assert.ok(!F.__page().log.some(c => c[0] === 'toast'));
    fill({ mail: sends(PAUSED) });
    F.openJourneyMail(); await tick(); F.__opt('throw', true);
    await assert.doesNotReject(resume());
    assert.deepEqual([F.__page().note.textContent, F.__page().note.bad], ['That did not work. Please try again.', true]);
  });
  test('a member cannot lift it, whatever calls it', async () => {
    fill({ mail: sends(PAUSED, false), answers: { 'post /api/journey/mail/resume': sends(PERSONAL) } });
    F.openJourneyMail();
    await F.resumeJourneyMail();
    assert.ok(!F.__page().log.some(c => c[0] === 'confirm' || c[0] === 'post'));
    fill({ mail: null });
    await assert.doesNotReject(F.resumeJourneyMail());
    assert.deepEqual(F.__page().log, []);
  });
  test('a pause that ran out while the window stood open is not lifted: what is true now is read and shown, without a question', async () => {
    const mail = sends(PAUSED);
    fill({ mail });
    F.openJourneyMail(); await tick();
    assert.match(F.__page().body.innerHTML, /jm-pause/);
    mail.sending = { ...PAUSED, paused_until: '2020-01-01T00:00:00.000Z' };   // time went by: the same answer, its moment now behind
    F.__opt('answers', { 'get /api/journey/mail': JSON.parse(JSON.stringify(mail)) });
    F.__page().log.length = 0;
    await resume();
    const log = F.__page().log;
    assert.ok(!log.some(c => c[0] === 'confirm' || c[0] === 'post'));
    assert.deepEqual(log.filter(c => c[0] === 'quiet'), [['quiet', '/api/journey/mail']]);
    assert.doesNotMatch(F.__page().body.innerHTML, /jm-pause|data-jm-resume/, 'drawn again although the server says what it said');
    assert.ok(log.some(c => c[0] === 'renderJourney'), 'and the page\'s button with it');
    // the clock is enough: the notice goes also when the server cannot be asked
    const offline = sends(PAUSED);
    fill({ mail: offline });
    F.openJourneyMail(); await tick();
    offline.sending = { ...PAUSED, paused_until: '2020-01-01T00:00:00.000Z' };
    F.__opt('throw', true);
    await assert.doesNotReject(resume());
    assert.doesNotMatch(F.__page().body.innerHTML, /jm-pause|data-jm-resume/);
    assert.equal(F.__state().journeyMail, offline);
  });
});

describe('reading the connection', () => {
  test('what the server says is kept; an error leaves "not set up, nothing connected, nothing allowed"', async () => {
    fill({ mail: null, answers: { 'get /api/journey/mail': owns(CONNECTED) } });
    assert.deepEqual(await F.loadJourneyMail(), owns(CONNECTED));
    assert.deepEqual(F.__state().journeyMail, owns(CONNECTED));
    for (const answer of [{ error: 'Unauthorized' }, undefined, null]) {
      fill({ mail: owns(CONNECTED), answers: { 'get /api/journey/mail': answer } });
      await F.loadJourneyMail();
      assert.deepEqual(F.__state().journeyMail, { configured: false, can_manage: false, connection: null });
    }
    fill({ mail: null, answers: { 'get /api/journey/mail': sends(PAUSED) } });
    await F.loadJourneyMail();
    assert.deepEqual(F.__state().journeyMail.sending, PAUSED, 'with what it says about sending');
  });
  test('logout leaves nothing of it behind', () => {
    fill({ mail: owns(CONNECTED) });
    F.openJourneyMail(); F.__set('journeyMailReturn', 'connected');
    F.resetJourneyMail();
    assert.deepEqual(F.__state(), { journeyMail: null, journeyMailReturn: null, open: false });
  });
  test('the window reads it again when it opens: the page may have stood open for hours', async () => {
    const now = sends({ ...PAUSED, sent: { day: 120, hour: 40 } });
    fill({ mail: sends(PERSONAL), answers: { 'get /api/journey/mail': now } });
    F.openJourneyMail();
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'quiet' || c[0] === 'get'), [['quiet', '/api/journey/mail']], 'once, and without the loading bar: nobody asked for it');
    assert.match(sliceFn(core, 'apiFetch', 'core.js'), /loader\.start\(\);/); assert.doesNotMatch(sliceFn(core, 'apiFetchSilent', 'core.js'), /loader/);
    assert.ok(F.__page().body.innerHTML.includes('<b>37 of 400</b>'), 'what was known is shown at once');
    await tick();
    assert.equal(F.__state().journeyMail, now);
    const body = F.__page().body.innerHTML;
    assert.ok(body.includes('<b>120 of 400</b>') && body.includes('<b>40 of 40</b>'));
    assert.match(body, /jm-pause/, 'a pause that began since is shown');
    assert.ok(F.__page().log.some(c => c[0] === 'renderJourney'), 'and the page\'s button says so');
  });
  test('nothing connected: nothing to read again', async () => {
    for (const mail of [owns(null), reads(null), null, { configured: false, can_manage: true, connection: null }]) {
      fill({ mail, answers: { 'get /api/journey/mail': sends(PERSONAL) } });
      F.openJourneyMail(); await tick();
      assert.ok(!F.__page().log.some(c => c[0] === 'get' || c[0] === 'quiet'), JSON.stringify(mail));
    }
  });
  test('the same answer draws nothing again; an error or a request that never arrived changes nothing', async () => {
    fill({ mail: sends(PERSONAL), answers: { 'get /api/journey/mail': JSON.parse(JSON.stringify(sends(PERSONAL))) } });
    F.openJourneyMail();
    type({ day: '123' });
    await tick();
    assert.ok(!F.__page().log.some(c => c[0] === 'renderJourney'));
    assert.equal(held().day, '123');
    for (const answer of [{ error: 'Unauthorized' }, undefined, null]) {
      const mail = sends(PERSONAL);
      fill({ mail, answers: { 'get /api/journey/mail': answer } });
      F.openJourneyMail(); await tick();
      assert.equal(F.__state().journeyMail, mail);
      assert.ok(!F.__page().log.some(c => c[0] === 'renderJourney'));
    }
    const mail = sends(PERSONAL);
    fill({ mail });
    F.__opt('throw', true);
    assert.doesNotThrow(() => F.openJourneyMail()); await tick();
    assert.equal(F.__state().journeyMail, mail);
  });
  test('an answer that comes after a logout or for another workspace is dropped', async () => {
    fill({ mail: sends(PERSONAL), answers: { 'get /api/journey/mail': sends(PAUSED) } });
    F.openJourneyMail();
    F.resetJourneyMail();
    await tick();
    assert.equal(F.__state().journeyMail, null);
    assert.ok(!F.__page().log.some(c => c[0] === 'renderJourney'));
    const other = owns({ ...CONNECTED, email: 'other@firma.de' });
    fill({ mail: sends(PERSONAL), answers: { 'get /api/journey/mail': sends(PAUSED) } });
    F.openJourneyMail();
    F.__set('journeyMail', other);
    await tick();
    assert.equal(F.__state().journeyMail, other);
  });
  test('it is disconnected meanwhile: the window says so', async () => {
    fill({ mail: sends(PERSONAL), answers: { 'get /api/journey/mail': { ...owns(null), sending: null } } });
    F.openJourneyMail(); await tick();
    assert.equal(F.__state().journeyMail.connection, null);
    assert.match(F.__page().body.innerHTML, /data-jm-connect>Sign in with Google</);
  });
});

describe('drawing the window again', () => {
  test('a limit that was typed and not saved stays in its field; an untouched field takes what is true now', async () => {
    const now = sends({ ...PERSONAL, limits: { day: 350, hour: 35, person: 4 }, sent: { day: 38, hour: 6 } });
    fill({ mail: sends(PERSONAL), answers: { 'get /api/journey/mail': now } });
    F.openJourneyMail();
    type({ day: '123', person: '' });
    await tick();
    assert.deepEqual(held(), { day: '123', hour: '35', person: '' });
    assert.ok(F.__page().body.innerHTML.includes('<b>38 of 350</b>'));
    assert.equal(F.__page().fields.day.defaultValue, '350', 'a field still knows what is saved');
  });
  test('after saving, the fields hold what the server answered', async () => {
    const answer = sends({ ...PERSONAL, limits: { day: 250, hour: 40, person: 3 } });
    fill({ mail: sends(PERSONAL), answers: { 'put /api/journey/mail/limits': answer } });
    F.openJourneyMail();
    type({ day: ' 250 ' });
    await F.__page().handlers['click [data-jm-limits-save]']({}, { disabled: false });
    assert.deepEqual(held(), { day: '250', hour: '40', person: '3' });
  });
  test('the cursor stays on the button or field it was on', () => {
    for (const [active, sel] of [[{ name: 'data-jm-limits-save' }, '[data-jm-limits-save]'], [{ name: 'data-jm-limit', value: 'hour' }, '[data-jm-limit="hour"]'], [{ name: 'data-jm-limit', value: 'day' }, '[data-jm-limit="day"]'],
      [{ name: 'data-jm-test' }, '[data-jm-test]'], [{ name: 'data-jm-limits-defaults' }, '[data-jm-limits-defaults]'], [{ name: 'data-jm-connect' }, '[data-jm-connect]'], [{ name: 'data-jm-disconnect' }, '[data-jm-disconnect]']]) {
      fill({ mail: sends(PERSONAL) });
      F.openJourneyMail();
      F.__page().log.length = 0;
      F.__opt('active', active);
      F.journeyMailRedraw();
      assert.deepEqual(F.__page().log.filter(c => c[0] === 'focus'), [['focus', sel]], sel);
    }
  });
  test('what held the cursor is gone: the cursor goes to the window\'s "close", never behind the window', async () => {
    fill({ mail: sends(PAUSED), answers: { 'post /api/journey/mail/resume': sends(PERSONAL) } });
    F.openJourneyMail();
    F.__page().log.length = 0;
    F.__opt('active', { name: 'data-jm-resume' });
    await F.__page().handlers['click [data-jm-resume]']();
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'focus'), [['focus', '[data-close]']]);
    fill({ mail: sends(PERSONAL), answers: { 'del /api/journey/mail': owns(null) } });
    F.openJourneyMail();
    F.__page().log.length = 0;
    F.__opt('active', { name: 'data-jm-limit', value: 'day' });
    await F.__page().handlers['click [data-jm-disconnect]']();
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'focus'), [['focus', '[data-close]']]);
  });
  test('a cursor that is not in the window\'s content is left alone', () => {
    for (const active of [null, { name: 'data-close', inside: false }, { name: 'data-jm-test', inside: false }]) {
      fill({ mail: sends(PERSONAL) });
      F.openJourneyMail();
      F.__page().log.length = 0;
      F.__opt('active', active);
      F.journeyMailRedraw();
      assert.deepEqual(F.__page().log.filter(c => c[0] === 'focus'), [], JSON.stringify(active));
    }
  });
  test('a value from the page never becomes part of a selector as it is', () => {
    fill({ mail: sends(PERSONAL) });
    F.openJourneyMail();
    F.__page().log.length = 0;
    F.__opt('active', { name: 'data-jm-limit', value: 'day"],[data-jm-disconnect' });
    assert.doesNotThrow(() => F.journeyMailRedraw());
    assert.deepEqual(F.__page().log.filter(c => c[0] === 'focus'), [['focus', '[data-close]']], 'no such field: the window\'s "close"');
    assert.ok(F.__page().asked.length >= 8);
    for (const sel of F.__page().asked) assert.match(sel, /^\[data-[a-z-]+(="[a-z]+")?\]$/, sel);
  });
  test('without the window only the page\'s button is drawn again', () => {
    fill({ mail: sends(PERSONAL) });
    assert.doesNotThrow(() => F.journeyMailRedraw());
    assert.deepEqual(F.__page().log, [['renderJourney']]);
    assert.match(sliceFn(js, 'journeyMailRedraw', 'journey-mail.js'), /if \(typeof renderJourney === 'function'\) renderJourney\(\);/);
  });
});

describe('the test email', () => {
  const press = async () => { const btn = { disabled: false }; await F.__page().handlers['click [data-jm-test]']({}, btn); return btn; };
  test('asks the server once, in the page\'s language, and says where it went', async () => {
    fill({ mail: owns(CONNECTED), answers: { 'post /api/journey/mail/test': { success: true, to: 'olga@firma.de' } } });
    F.openJourneyMail();
    const btn = await press();
    const p = F.__page();
    assert.deepEqual(p.log.filter(c => c[0] === 'post'), [['post', '/api/journey/mail/test', { lang: 'en' }]]);
    assert.deepEqual([p.note.textContent, p.note.hidden, p.note.bad], ['Test email sent to olga@firma.de. It can take a moment to arrive.', false, false]);
    assert.equal(btn.disabled, false, 'the button is free again');
    fill({ lang: 'de', mail: owns(CONNECTED), answers: { 'post /api/journey/mail/test': { success: true, to: 'olga@firma.de' } } });
    F.openJourneyMail();
    await press();
    assert.deepEqual(F.__page().log.find(c => c[0] === 'post')[2], { lang: 'de' });
    assert.equal(F.__page().note.textContent, 'Test-E-Mail an olga@firma.de gesendet. Es kann einen Moment dauern, bis sie ankommt.');
  });
  test('a refusal is said in the window in words, marked as a problem', async () => {
    for (const [answer, sentence] of [[{ error: 'x', code: 'gone' }, 'Google no longer accepts this connection. Please sign in with Google again.'],
      [{ error: 'x', code: 'rejected', detail: 'Mail service not enabled' }, 'Google refused the email: Mail service not enabled'], [{ error: 'x', code: 'unreachable' }, 'Google could not be reached. Please try again.'],
      [{ error: 'x', code: 'not_connected' }, 'No address is connected.'], [{ error: 'x', code: 'forbidden' }, 'Only owners and admins can connect the email address.'],
      [{ error: 'x', code: 'no_address' }, 'The signed-in account has no valid email address for the test.'], [{ error: 'Internal server error' }, 'That did not work. Please try again.'], [undefined, 'That did not work. Please try again.'],
      [{ error: 'x', code: 'paused' }, 'Sending is paused. A test email can go out when the pause is over.'],
      [{ error: 'x', code: 'limit' }, 'The daily limit of this address is reached. A test email can go out when there is room again.'],
      [{ error: 'x', code: 'constructor' }, 'That did not work. Please try again.'], [{ success: false }, 'That did not work. Please try again.']]) {
      fill({ mail: owns(CONNECTED), answers: { 'post /api/journey/mail/test': answer } });
      F.openJourneyMail();
      const btn = await press();
      assert.deepEqual([F.__page().note.textContent, F.__page().note.bad, btn.disabled], [sentence, true, false]);
    }
    fill({ lang: 'de', mail: sends(PAUSED), answers: { 'post /api/journey/mail/test': { error: 'x', code: 'paused' } } });
    F.openJourneyMail();
    await press();
    assert.equal(F.__page().note.textContent, 'Der Versand ist pausiert. Eine Test-E-Mail kann hinausgehen, wenn die Pause vorbei ist.');
    fill({ lang: 'de', mail: sent(400), answers: { 'post /api/journey/mail/test': { error: 'x', code: 'limit' } } });
    F.openJourneyMail();
    await press();
    assert.equal(F.__page().note.textContent, 'Das Tageslimit dieser Adresse ist erreicht. Eine Test-E-Mail kann hinausgehen, sobald wieder Platz ist.');
  });
  test('a request that never reached the server is said the same way, not thrown', async () => {
    fill({ mail: owns(CONNECTED) });
    F.openJourneyMail();
    F.__opt('throw', true);
    await assert.doesNotReject(press());
    assert.deepEqual([F.__page().note.textContent, F.__page().note.bad], ['That did not work. Please try again.', true]);
  });
  test('while it is on its way the window says so and the button cannot be pressed again', async () => {
    fill({ mail: sends(PERSONAL) });
    F.openJourneyMail(); await tick();
    const btn = { disabled: false }, seen = [];
    F.__opt('answers', { 'post /api/journey/mail/test': () => { seen.push([btn.disabled, F.__page().note.textContent, F.__page().note.hidden, F.__page().note.bad]); return { success: true, to: 'olga@firma.de' }; } });
    await F.__page().handlers['click [data-jm-test]']({}, btn);
    assert.deepEqual(seen, [[true, 'Sending…', false, false]]);
    assert.equal(btn.disabled, false);
  });
  test('what Google said is text in the window', () => {
    assert.match(sliceFn(js, 'journeyMailNote', 'journey-mail.js'), /el\.textContent = text;/);
    assert.doesNotMatch(sliceFn(js, 'journeyMailNote', 'journey-mail.js'), /innerHTML/);
  });
  test('a test email counts like any other: the numbers are read again, and the sentence is said into the window as it is then', async () => {
    fill({ mail: sent(37, 5), answers: { 'post /api/journey/mail/test': { success: true, to: 'olga@firma.de' } } });
    F.openJourneyMail(); await tick();
    F.__opt('answers', { 'post /api/journey/mail/test': { success: true, to: 'olga@firma.de' }, 'get /api/journey/mail': sent(38, 6) });
    F.__page().log.length = 0;
    await press();
    const p = F.__page();
    assert.deepEqual(p.log.filter(c => ['post', 'get', 'quiet'].includes(c[0])).map(c => c[0] + ' ' + c[1]), ['post /api/journey/mail/test', 'quiet /api/journey/mail'], 'sent first, then read');
    assert.ok(p.body.innerHTML.includes('<b>38 of 400</b>') && p.body.innerHTML.includes('<b>6 of 40</b>'));
    assert.deepEqual([p.note.textContent, p.note.hidden, p.note.bad], ['Test email sent to olga@firma.de. It can take a moment to arrive.', false, false], 'the sentence is in the window that was drawn again');
  });
  test('a refusal may be news — a pause that began, a day that is full: the window shows it, with the sentence', async () => {
    fill({ mail: sends(PERSONAL) });
    F.openJourneyMail(); await tick();
    F.__opt('answers', { 'post /api/journey/mail/test': { error: 'x', code: 'paused' }, 'get /api/journey/mail': sends(PAUSED) });
    await press();
    let p = F.__page();
    assert.match(p.body.innerHTML, /jm-pause/);
    assert.deepEqual([p.note.textContent, p.note.bad, p.note.hidden], ['Sending is paused. A test email can go out when the pause is over.', true, false]);
    fill({ mail: sent(399) });
    F.openJourneyMail(); await tick();
    F.__opt('answers', { 'post /api/journey/mail/test': { error: 'x', code: 'limit' }, 'get /api/journey/mail': sent(400) });
    await press();
    p = F.__page();
    assert.match(p.body.innerHTML, /jm-sent-full/);
    assert.deepEqual([p.note.textContent, p.note.bad], ['The daily limit of this address is reached. A test email can go out when there is room again.', true]);
  });
});

describe('disconnecting', () => {
  test('asks first, by the address; "no" changes nothing', async () => {
    fill({ mail: owns(CONNECTED) });
    F.openJourneyMail();
    F.__opt('confirm', false);
    await F.__page().handlers['click [data-jm-disconnect]']();
    const log = F.__page().log;
    const asked = log.find(c => c[0] === 'confirm')[1];
    assert.deepEqual([asked.title, asked.message, asked.confirmLabel, asked.danger], ['Disconnect news@firma.de?', 'Workflows can then send no emails until an address is connected again.', 'Disconnect', true]);
    assert.ok(!log.some(c => c[0] === 'del'));
    assert.deepEqual(F.__state().journeyMail, owns(CONNECTED));
  });
  test('"yes": the server is asked, the window shows "Sign in with Google" again, the page\'s button is redrawn, and it is said', async () => {
    fill({ mail: owns(CONNECTED), answers: { 'del /api/journey/mail': owns(null) } });
    F.openJourneyMail();
    await F.__page().handlers['click [data-jm-disconnect]']();
    const p = F.__page();
    assert.deepEqual(p.log.filter(c => c[0] === 'del'), [['del', '/api/journey/mail']]);
    assert.equal(F.__state().journeyMail.connection, null);
    assert.match(p.body.innerHTML, /data-jm-connect>Sign in with Google</);
    assert.ok(p.log.some(c => c[0] === 'renderJourney'));
    assert.deepEqual(p.log.filter(c => c[0] === 'toast'), [['toast', 'Email address disconnected.']]);
  });
  test('a refusal or a request that never arrived: said in the window, the address stays shown', async () => {
    fill({ mail: owns(CONNECTED), answers: { 'del /api/journey/mail': { error: 'Owner or admin only', code: 'forbidden' } } });
    F.openJourneyMail();
    await F.__page().handlers['click [data-jm-disconnect]']();
    assert.deepEqual([F.__page().note.textContent, F.__page().note.bad], ['Only owners and admins can connect the email address.', true]);
    assert.deepEqual(F.__state().journeyMail, owns(CONNECTED));
    fill({ mail: owns(CONNECTED) });
    F.openJourneyMail(); F.__opt('throw', true);
    await assert.doesNotReject(F.__page().handlers['click [data-jm-disconnect]']());
    assert.deepEqual(F.__state().journeyMail, owns(CONNECTED));
  });
  test('with the limits and a pause gone, nothing of them stays in the window', async () => {
    fill({ mail: sends(PAUSED), answers: { 'del /api/journey/mail': { ...owns(null), sending: null } } });
    F.openJourneyMail();
    await F.__page().handlers['click [data-jm-disconnect]']();
    assert.doesNotMatch(F.__page().body.innerHTML, /jm-part|jm-pause|data-jm-limit/);
    assert.doesNotMatch(F.journeyMailButtonHtml(), /is-paused/);
  });
});

describe('the look', () => {
  const rule = sel => { const m = css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}$`, 'm')); return m ? m[1].trim() : null; };
  test('the window is a column of its own (a window\'s body spaces only its direct children); a long address does not push the page apart', () => {
    assert.match(css, /^\.jm \{ display: flex; flex-direction: column; gap: 12px; padding-top: 6px; \}$/m);
    assert.match(css, /^\.jm-btn \{ max-width: 320px; \}$/m);
    assert.match(css, /^\.jm-actions \{ display: flex; flex-wrap: wrap; gap: 8px; \}$/m);
    assert.match(css, /^\.jm-note\.bad \{ color: var\(--danger\); font-weight: 600; \}$/m);
    assert.match(css, /^\.jm-addr \{[^}]*overflow-wrap: anywhere; \}$/m);
  });
  test('the icons it uses are in the sprite', () => {
    assert.ok(html.includes('<symbol id="i-mail"'));
    assert.ok(html.includes('<symbol id="i-alert"'));
  });
  test('every class the limits and the pause are drawn with has its rule', () => {
    const drawn = [...new Set([...js.matchAll(/class="(jm-[a-z-]+)/g)].map(m => m[1]))].sort();
    assert.deepEqual(drawn, ['jm-actions', 'jm-addr', 'jm-limit', 'jm-limits', 'jm-meter', 'jm-note', 'jm-part', 'jm-part-title', 'jm-pause', 'jm-pause-detail', 'jm-pause-title', 'jm-sent', 'jm-sent-full', 'jm-sent-line']);
    for (const name of drawn) assert.ok(rule('.' + name), `.${name}`);
  });
  test('a meter is slim and turns to the colour of a warning near its limit; a paused button and the notice have that colour', () => {
    assert.equal(rule('.jm-meter'), 'height: 6px; border-radius: 3px; background: var(--surface-3); overflow: hidden;');
    assert.equal(rule('.jm-meter span'), 'display: block; height: 100%; border-radius: 3px; background: var(--primary);');
    assert.equal(rule('.jm-meter.is-near span'), 'background: var(--warning);');
    assert.ok(css.indexOf('.jm-meter span {') < css.indexOf('.jm-meter.is-near span {'), 'the warning comes after the plain colour');
    assert.equal(rule('.jm-sent-full'), 'font-size: var(--fs-sm); font-weight: 600; color: var(--warning);');
    assert.equal(rule('.jm-btn.is-paused'), 'border-color: var(--warning-bd); background: var(--warning-bg); color: var(--warning);');
    assert.ok(css.indexOf('.btn-secondary:hover {') < css.indexOf('.jm-btn.is-paused {'), 'after the button\'s own colours, which weigh the same');
    assert.match(rule('.jm-pause'), /border: 1px solid var\(--warning-bd\); border-radius: var\(--r-lg\); background: var\(--warning-bg\);$/);
    assert.match(rule('.jm-pause-title'), /color: var\(--warning\); overflow-wrap: anywhere;$/);
    assert.match(rule('.jm-pause-detail'), /overflow-wrap: anywhere;$/, 'Google\'s words may be long');
  });
  test('a limit is its name and its number on one line, what it means under them; the list is framed', () => {
    assert.equal(rule('.jm-limit'), 'display: grid; grid-template-columns: minmax(0, 1fr) 104px; align-items: center; gap: 4px 12px; padding: 10px 12px; border-bottom: 1px solid var(--divider);');
    assert.equal(rule('.jm-limit:last-child'), 'border-bottom: 0;');
    assert.equal(rule('.jm-limit .help'), 'grid-column: 1 / -1;');
    assert.equal(rule('.jm-limit .input'), 'text-align: right;');
    assert.equal(rule('.jm-limits'), 'border: 1px solid var(--border); border-radius: var(--r-lg);');
    assert.match(rule('.jm-part'), /^display: flex; flex-direction: column; gap: 12px;.*border-top: 1px solid var\(--divider\);$/);
  });
  test('the two lines are hidden by the attribute alone, and nothing here forces a look', () => {
    assert.match(css, /^\[hidden\] \{ display: none !important; \}$/m);
    assert.doesNotMatch(rule('.jm-note'), /display/);
    const own = css.split('\n').filter(l => /^\.jm[-. ]/.test(l));
    assert.ok(own.length >= 28, `the file's own rules (${own.length})`);
    for (const l of own) assert.doesNotMatch(l, /!important/, l);
    for (const token of [...new Set(own.join('\n').match(/var\(--[a-z0-9-]+\)/g))]) assert.ok(css.includes(`${token.slice(4, -1)}:`), `${token} is defined`);
  });
});
