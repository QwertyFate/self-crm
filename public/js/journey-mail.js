/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY MAIL — the email address the Customer Journey sends from
   (CUSTOMER_JOURNEY_CHANGES Part 2, 2026-11-19; server: routes/journey-mail.js).

   ONE ADDRESS PER WORKSPACE, a Gmail address. An owner or admin connects it by
   signing in on Google's own page: "Sign in with Google" sends the whole tab
   to /api/journey/mail/google/start, on to Google, and back to
   /?journey_mail=<word>. The CRM never sees a password; the server keeps what
   Google hands back and gives the page only the address.

   THE BUTTON  at the top of the Customer Journey page (journey.js draws it
   with journeyMailButtonHtml): "Connect email", or the connected address.
   Everyone may open it and see which address sends; connecting, the test
   email and disconnecting are for owners and admins (the server decides:
   can_manage).

   COMING BACK FROM GOOGLE
     • init() (auth.js) hands the address line to journeyMailKeepReturn()
       before showApp() clears it. A word in it also makes the app open on
       the Customer Journey page, however long Google's pages took.
     • loadJourney() (journey.js) reads the connection with the page and then
       calls journeyMailAfterLoad(), which says how it went, once, and opens
       the window.

   SENDING LIMITS (Part 17, 2026-11-20)  Google lets a Gmail address send 500
   emails a day and a Google Workspace address 2,000 (500 while it is a
   trial), counted over a rolling 24 hours; who goes over cannot send for up
   to a day, and who does it again and again may lose the account. So the
   server keeps limits of its own below Google's — per day, per hour, and per
   person per day — and an email that would go over one WAITS: it is not lost
   and not failed. When Google itself says "limit", the server pauses sending
   from the address and tells every owner and admin.
   The window shows it for a connected address (`sending` in what the server
   answers; a server from before has none, and the part is not drawn):
     · on top, while sending is paused: until when, what Google said, what it
       means, and for an owner or admin "Send again now" — which asks first,
       since sending on into Google's limit is what the pause protects from;
     · "Sending limits": how much went out in the last 24 hours and in the
       last hour, each with a slim meter that turns to the colour of a
       warning near its limit; the three limits — number fields with one
       "Save limits" and "Back to the recommended values" for an owner or
       admin, plain numbers for a member; Google's own limit for this kind of
       address in words, which the daily field cannot go above; what happens
       at a limit; and whom to write to. A number out of its range is not
       sent: its field is marked and the ranges are said under the fields.
   The page's button says so while sending is paused. A field that holds the
   recommended value is sent as "the default" (null).
   The page reads the connection only when it is opened, and it may stand
   open for hours: so the window reads it again when it opens, after a test
   email (it counts like any other) and when a pause ran out by itself
   (journeyMailRefresh). Drawing the window again keeps what a person typed
   into a limit and has not saved, and keeps the cursor inside the window.

   FUNCTION MAP  journeyMailKeepReturn, loadJourneyMail, journeyMailAfterLoad,
                 journeyMailButtonHtml, journeyMailBodyHtml, openJourneyMail,
                 connectJourneyMail, testJourneyMail, disconnectJourneyMail,
                 saveJourneyMailLimits, journeyMailDefaults, resumeJourneyMail,
                 journeyMailRefresh, journeyMailRedraw, journeyMailMark,
                 journeyMailErrorText, resetJourneyMail;
                 pure: journeyMailSending, journeyMailPausedUntil,
                 journeyMailCount, journeyMailMeterHtml, journeyMailPauseHtml,
                 journeyMailLimitsHtml, journeyMailLimitsOf
   ═══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_MAIL_RETURNS = ['connected', 'denied', 'expired', 'scopes', 'failed', 'not_configured', 'forbidden'];
// The route's refusal codes as sentences.
const JOURNEY_MAIL_ERRORS = { forbidden: 'jm_ret_forbidden', not_connected: 'jm_err_not_connected', no_address: 'jm_err_no_address', gone: 'jm_err_gone', rejected: 'jm_err_rejected', unreachable: 'jm_err_unreachable',
  limits: 'jm_err_limits', paused: 'jm_err_paused', limit: 'jm_err_limit' };
const JOURNEY_MAIL_LIMITS = { day: 'jm_lim_day', hour: 'jm_lim_hour', person: 'jm_lim_person' };   // the three limits, in the order of their fields
const JOURNEY_MAIL_NEAR = 0.8;   // from this part of a limit on, its meter has the colour of a warning

let journeyMail       = null;   // GET /api/journey/mail: { configured, can_manage, connection, sending }
let journeyMailReturn = null;   // the word Google's round trip came back with, until it is said
let journeyMailWindow = null;   // the open window, redrawn after a test or a disconnect

// Logout and a workspace switch (journey.js resetJourneyUI): nothing of the last workspace's connection stays.
function resetJourneyMail() { journeyMail = null; journeyMailReturn = null; journeyMailWindow = null; }

// init(): the word from the address; anything not in the list is ignored. With a word the app opens on the journey
// page: the remembered page (core.js appRestorePage) is set to it, with a fresh time.
function journeyMailKeepReturn(params) {
  const word = params.get('journey_mail');
  journeyMailReturn = JOURNEY_MAIL_RETURNS.includes(word) ? word : null;
  if (!journeyMailReturn) return;
  try { sessionStorage.setItem('crm_reload_page', JSON.stringify({ page: 'journey', at: Date.now() })); } catch (e) { /* storage blocked: said on the next visit to the page */ }
}

async function loadJourneyMail() {
  const res = await api.get('/api/journey/mail');
  journeyMail = res && !res.error ? res : { configured: false, can_manage: false, connection: null };
  return journeyMail;
}

// After the journey page has loaded: how Google's round trip went, said once, and the window with the result.
function journeyMailAfterLoad() {
  if (!journeyMailReturn) return;
  const word = journeyMailReturn;
  journeyMailReturn = null;
  ui.toast(t('jm_ret_' + word));
  openJourneyMail();
}

// A refusal as a sentence. The sentence about limits names the ranges that are allowed (what the server gave as `max`).
function journeyMailErrorText(res) {
  const code = res && res.code, s = journeyMailSending();
  return tf(Object.hasOwn(JOURNEY_MAIL_ERRORS, code) ? JOURNEY_MAIL_ERRORS[code] : 'jm_err_generic',
    { detail: (res && res.detail) || '', day: s ? journeyMailCount(s.max.day) : '', person: s ? journeyMailCount(s.max.person) : '' });
}

// What the server says about sending from the connected address — its limits, how much went out, a pause — or null:
// while no address is connected, from a server that knows no limits yet, or when a number in it is none.
function journeyMailSending() {
  const s = journeyMail && journeyMail.connection ? journeyMail.sending : null, whole = v => Number.isInteger(v) && v >= 0;
  if (!s || typeof s !== 'object' || !s.limits || !s.defaults || !s.max || !s.sent || !whole(s.google_day) || !s.google_day) return null;
  for (const group of [s.limits, s.defaults, s.max]) if (!Object.keys(JOURNEY_MAIL_LIMITS).every(k => whole(group[k]) && group[k] > 0)) return null;
  return whole(s.sent.day) && whole(s.sent.hour) ? s : null;
}
// When a pause of sending ends, as a time — or 0 while nothing is paused (and once a pause is over).
function journeyMailPausedUntil(now = Date.now()) {
  const s = journeyMailSending(), until = s && typeof s.paused_until === 'string' ? Date.parse(s.paused_until) : NaN;
  return Number.isFinite(until) && until > now ? until : 0;
}

// A number as the page's language writes it: 2,000 in English, 2.000 in German.
function journeyMailCount(n) { return Number(n).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-GB'); }

// The button at the top of the journey page: the connected address, or the invitation to connect one. While sending
// is paused it says so, in the colour of a warning — and until when, to the pointer that rests on it: seen from the
// page without opening the window.
function journeyMailButtonHtml() {
  const c = journeyMail && journeyMail.connection, until = c ? journeyMailPausedUntil() : 0;
  return `<button type="button" class="btn btn-secondary btn-sm jm-btn${until ? ' is-paused' : ''}"${until ? ` title="${esc(tf('jm_pause_title', { when: journeyWhen(until) }))}"` : ''} onclick="openJourneyMail()">${icon(until ? 'alert' : 'mail')}<span class="truncate">${
    esc(c ? tf(until ? 'jm_btn_paused' : 'jm_btn_on', { email: c.email }) : t('jm_btn_off'))}</span></button>`;
}

// One line of "how much went out": the words, "37 of 400", and a slim meter — in the colour of a warning from four
// fifths of the limit on. At the limit it also says what that means: emails wait. One email already shows as a
// sliver: the meter is empty only while nothing went out.
function journeyMailMeterHtml(label, sent, limit) {
  const n = Math.max(0, Number(sent) || 0), max = Math.max(1, Number(limit) || 1), part = Math.min(1, n / max), said = tf('jm_lim_of', { sent: journeyMailCount(n), limit: journeyMailCount(max) });
  return `<div class="jm-sent"><p class="jm-sent-line"><span>${esc(t(label))}</span><b>${esc(said)}</b></p>`
    + `<div class="jm-meter${part >= JOURNEY_MAIL_NEAR ? ' is-near' : ''}" role="meter" aria-label="${esc(t(label))}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(n, max)}" aria-valuetext="${esc(said)}"><span style="width:${n ? Math.max(2, Math.round(part * 100)) : 0}%"></span></div>`
    + `${n >= max ? `<p class="jm-sent-full">${esc(t('jm_lim_full'))}</p>` : ''}</div>`;
}
// The notice while sending is paused: until when, what Google said, what it means — and for an owner or admin the way
// to send again at once. Nothing while nothing is paused.
function journeyMailPauseHtml(now = Date.now()) {
  const until = journeyMailPausedUntil(now);
  if (!until) return '';
  const s = journeyMailSending(), why = s.pause_detail ? tf('jm_pause_google', { detail: s.pause_detail }) : s.pause_reason === 'google_limit' ? t('jm_pause_google_plain') : '';
  return `<div class="jm-pause" role="status">
      <p class="jm-pause-title">${icon('alert')}<span>${esc(tf('jm_pause_title', { when: journeyWhen(until) }))}</span></p>
      ${why ? `<p class="jm-pause-detail">${esc(why)}</p>` : ''}
      <p class="help">${esc(t('jm_pause_what'))}</p>
      ${journeyMail.can_manage ? `<div class="jm-actions"><button type="button" class="btn btn-secondary btn-sm" data-jm-resume>${esc(t('jm_resume'))}</button></div>` : ''}
    </div>`;
}
// "Sending limits": how much went out, the three limits (fields for an owner or admin, numbers for a member), Google's
// own limit for this kind of address, what happens at a limit, and whom to write to. Nothing without `sending`.
function journeyMailLimitsHtml() {
  const s = journeyMailSending();
  if (!s) return '';
  const manage = !!journeyMail.can_manage;
  // what stands under each limit: under the daily one, what Google itself allows this kind of address
  const hints = { day: tf(s.kind === 'personal' ? 'jm_lim_google_personal' : 'jm_lim_google_workspace', { n: journeyMailCount(s.google_day) }), hour: t('jm_lim_hour_hint'), person: t('jm_lim_person_hint') };
  const limit = key => `<div class="jm-limit">${manage
    ? `<label class="label" for="jm-limit-${key}">${esc(t(JOURNEY_MAIL_LIMITS[key]))}</label><input class="input" id="jm-limit-${key}" type="number" min="1" max="${Number(s.max[key])}" step="1" inputmode="numeric" autocomplete="off" aria-describedby="jm-limit-${key}-hint" data-jm-limit="${key}" value="${Number(s.limits[key])}">`
    : `<span class="label">${esc(t(JOURNEY_MAIL_LIMITS[key]))}</span><b>${esc(journeyMailCount(s.limits[key]))}</b>`}<p class="help" id="jm-limit-${key}-hint">${esc(hints[key])}</p></div>`;
  return `<section class="jm-part" aria-label="${esc(t('jm_lim_title'))}">
      <h3 class="jm-part-title">${esc(t('jm_lim_title'))}</h3>
      ${journeyMailMeterHtml('jm_lim_sent_day', s.sent.day, s.limits.day)}
      ${journeyMailMeterHtml('jm_lim_sent_hour', s.sent.hour, s.limits.hour)}
      <div class="jm-limits">${Object.keys(JOURNEY_MAIL_LIMITS).map(limit).join('')}</div>
      ${manage ? `<div class="jm-actions">
        <button type="button" class="btn btn-primary btn-sm" data-jm-limits-save>${esc(t('jm_lim_save'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-jm-limits-defaults>${esc(t('jm_lim_defaults'))}</button>
      </div>
      <p class="jm-note" data-jm-limits-note role="status" hidden></p>` : ''}
      <p class="help">${esc(t('jm_lim_wait'))}</p>
      <p class="help">${esc(t('jm_lim_advice'))}</p>
    </section>`;
}
// What the three fields hold, as the limits the server takes — { body } — or { error, part }: the first of them that
// is no whole number in its range (per day up to the most the server allows, per hour up to the daily limit), the
// field to go to. A field that holds the recommended value is sent as "the default" (null): it then follows the
// recommendation, should that change.
function journeyMailLimitsOf(values, s) {
  const whole = v => (/^\d{1,5}$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : NaN);
  const day = whole(values.day), hour = whole(values.hour), person = whole(values.person);
  const part = !(day >= 1 && day <= s.max.day) ? 'day' : !(hour >= 1 && hour <= Math.min(s.max.hour, day)) ? 'hour' : !(person >= 1 && person <= s.max.person) ? 'person' : '';
  if (part) return { error: true, part };
  const sent = (v, key) => (v === s.defaults[key] ? null : v);
  return { body: { day: sent(day, 'day'), hour: sent(hour, 'hour'), person: sent(person, 'person') } };
}

// The window's content for what is known now. Pure apart from t()/tf()/icon()/fmtDate() and the language.
function journeyMailBodyHtml() {
  const m = journeyMail || {}, c = m.connection, manage = !!m.can_manage;
  if (c) {
    const since = c.connected_by_name ? tf('jm_connected_by', { name: c.connected_by_name, date: fmtDate(c.connected_at) }) : tf('jm_connected_on', { date: fmtDate(c.connected_at) });
    return `<div class="jm">
        ${journeyMailPauseHtml()}
        <p class="jm-addr">${icon('mail')}<b>${esc(c.email)}</b></p>
        <p class="help">${esc(since)} ${esc(t('jm_send_only'))}</p>
        ${manage ? `<div class="jm-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-jm-test>${esc(t('jm_test'))}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-jm-connect>${esc(t('jm_other'))}</button>
          <button type="button" class="btn btn-danger-ghost btn-sm" data-jm-disconnect>${esc(t('jm_disconnect'))}</button>
        </div>
        <p class="jm-note" data-jm-note role="status" hidden></p>` : ''}
        ${journeyMailLimitsHtml()}
      </div>`;
  }
  if (!manage) return `<div class="jm"><p>${esc(t('jm_intro'))}</p><p class="help">${esc(t('jm_none_member'))}</p></div>`;
  if (!m.configured) return `<div class="jm"><p>${esc(t('jm_intro'))}</p><p class="help">${esc(t('jm_not_configured'))}</p></div>`;
  return `<div class="jm">
      <p>${esc(t('jm_intro'))}</p>
      <div class="jm-actions"><button type="button" class="btn btn-primary" data-jm-connect>${esc(t('jm_signin'))}</button></div>
      <p class="help">${esc(t('jm_signin_hint'))}</p>
    </div>`;
}

function openJourneyMail() {
  if (journeyMailWindow) return journeyMailWindow;
  const m = ui.modal({ title: t('jm_title'), size: 'md', body: journeyMailBodyHtml(),
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_close'))}</button>`,
    onClose: () => { journeyMailWindow = null; } });
  journeyMailWindow = m;
  on(m.el, 'click', '[data-jm-connect]', () => connectJourneyMail());
  on(m.el, 'click', '[data-jm-test]', (e, btn) => testJourneyMail(btn));
  on(m.el, 'click', '[data-jm-disconnect]', () => disconnectJourneyMail());
  on(m.el, 'click', '[data-jm-limits-save]', (e, btn) => saveJourneyMailLimits(btn));
  on(m.el, 'click', '[data-jm-limits-defaults]', () => journeyMailDefaults());
  on(m.el, 'click', '[data-jm-resume]', () => resumeJourneyMail());
  on(m.el, 'input', '[data-jm-limit]', () => { journeyMailMark(''); journeyMailNote('', false, '[data-jm-limits-note]'); });   // typing takes an old message away
  // Enter in a limit saves — by pressing the button, so through its one-press lock (core.js)
  on(m.el, 'keydown', '[data-jm-limit]', e => { if (e.key !== 'Enter') return; e.preventDefault(); const btn = m.el.querySelector('[data-jm-limits-save]'); if (btn) btn.click(); });
  // A window puts the cursor into its first field. Here that would be a limit, far down: it stays at the top.
  const top = m.el.querySelector('[data-close]');
  if (top && typeof top.focus === 'function') top.focus();
  if (journeyMail && journeyMail.connection) journeyMailRefresh();   // the page may have stood open for hours
  return m;
}

// What the window says under its buttons: how a test went, or why something was refused. `sel` is the line that
// says it: the one under the address's buttons, or the one under the limits.
function journeyMailNote(text, bad = false, sel = '[data-jm-note]') {
  const el = journeyMailWindow && journeyMailWindow.el.querySelector(sel);
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.classList.toggle('bad', !!bad);
}
// The limit that is out of its range is marked and given the cursor; '' takes the mark away.
function journeyMailMark(part) {
  const root = journeyMailWindow && journeyMailWindow.el;
  for (const key of root ? Object.keys(JOURNEY_MAIL_LIMITS) : []) {
    const el = root.querySelector(`[data-jm-limit="${key}"]`);
    if (!el) continue;
    if (key === part) { el.setAttribute('aria-invalid', 'true'); el.focus(); } else el.removeAttribute('aria-invalid');
  }
}
// The window and the page's button drawn again from what is known now. A limit a person typed and has not saved
// stays in its field (unless `keepTyped` is false: after saving, the fields hold what the server answered), and the
// cursor stays on the button or field it was on — or goes to the window's "close" when that is gone: never behind
// the window.
function journeyMailRedraw(keepTyped = true) {
  const w = journeyMailWindow;
  if (w) {
    const fields = () => Object.keys(JOURNEY_MAIL_LIMITS).map(key => w.el.querySelector(`[data-jm-limit="${key}"]`));
    const typed = keepTyped ? fields().map(el => (el && el.value !== el.defaultValue ? el.value : null)) : [];
    const at = typeof document !== 'undefined' ? document.activeElement : null, inside = !!at && typeof w.body.contains === 'function' && w.body.contains(at);
    const name = inside ? ['data-jm-limit', 'data-jm-test', 'data-jm-connect', 'data-jm-disconnect', 'data-jm-limits-save', 'data-jm-limits-defaults', 'data-jm-resume'].find(n => at.hasAttribute(n)) : '';
    const held = name === 'data-jm-limit' ? `[data-jm-limit="${String(at.getAttribute(name)).replace(/[^a-z]/g, '')}"]` : name ? `[${name}]` : '';
    w.body.innerHTML = journeyMailBodyHtml();
    fields().forEach((el, i) => { if (el && typed[i] != null) el.value = typed[i]; });
    if (inside) { const el = (held && w.el.querySelector(held)) || w.el.querySelector('[data-close]'); if (el && typeof el.focus === 'function') el.focus(); }
  }
  if (typeof renderJourney === 'function') renderJourney();
}
// What the server knows now, read again and shown — quietly: nobody asked for it, so the loading bar stays still. A
// late answer changes nothing when the connection was read or cleared meanwhile (a logout, another workspace), and
// the window is drawn again only when something changed.
async function journeyMailRefresh() {
  const was = journeyMail, fresh = await journeyMailSend(() => apiFetchSilent('/api/journey/mail'));
  if (journeyMail !== was || !fresh || fresh.error) return;
  const changed = JSON.stringify(fresh) !== JSON.stringify(was);
  journeyMail = fresh;
  if (changed) journeyMailRedraw();
}

// Google's page cannot open inside a fetch: the whole tab goes there and comes back.
function connectJourneyMail() {
  appRememberPage();
  window.location.href = '/api/journey/mail/google/start';
}

// A request that never reached the server is a refusal like any other: said in the window, not thrown.
async function journeyMailSend(call) { try { return await call(); } catch (e) { return { error: true }; } }

async function testJourneyMail(btn) {
  if (btn) btn.disabled = true;
  journeyMailNote(t('jm_test_sending'));
  const res = await journeyMailSend(() => api.post('/api/journey/mail/test', { lang: currentLang === 'en' ? 'en' : 'de' }));
  if (btn) btn.disabled = false;
  // A test email counts like any other, and a refusal may be news (a pause, a full day): the numbers are read again
  // first, then the sentence is said — into the window as it is then.
  await journeyMailRefresh();
  if (!res || res.error || !res.success) return journeyMailNote(journeyMailErrorText(res), true);
  journeyMailNote(tf('jm_test_ok', { to: res.to }));
}

// "Save limits": the three fields to the server, which answers with everything it knows — shown at once. What is
// no whole number in its range is said under the fields, with the ranges, its field is marked, and nothing is sent.
async function saveJourneyMailLimits(btn) {
  const s = journeyMailSending(), root = journeyMailWindow && journeyMailWindow.el;
  if (!s || !root || !journeyMail.can_manage) return;
  const held = key => { const el = root.querySelector(`[data-jm-limit="${key}"]`); return el ? el.value : ''; };
  const out = journeyMailLimitsOf({ day: held('day'), hour: held('hour'), person: held('person') }, s);
  journeyMailMark(out.part || '');
  if (out.error) return journeyMailNote(journeyMailErrorText({ code: 'limits' }), true, '[data-jm-limits-note]');
  if (btn) btn.disabled = true;
  const res = await journeyMailSend(() => api.put('/api/journey/mail/limits', out.body));
  if (btn) btn.disabled = false;
  if (!res || res.error) return journeyMailNote(journeyMailErrorText(res), true, '[data-jm-limits-note]');
  journeyMail = res;
  journeyMailRedraw(false);
  ui.toast(t('jm_lim_saved'));
}
// "Back to the recommended values": they are put into the fields. Nothing is saved until "Save limits" is pressed.
function journeyMailDefaults() {
  const s = journeyMailSending(), root = journeyMailWindow && journeyMailWindow.el;
  if (!s || !root) return;
  for (const key of Object.keys(JOURNEY_MAIL_LIMITS)) { const el = root.querySelector(`[data-jm-limit="${key}"]`); if (el) el.value = String(s.defaults[key]); }
  journeyMailMark('');
  journeyMailNote('', false, '[data-jm-limits-note]');
}
// "Send again now": lifts a pause — after asking, because sending on into Google's limit is what the pause is there
// to keep from. A pause that ran out while the window stood open needs no lifting: the notice goes at once (the
// clock says so, also without the server), and what is true now is read.
async function resumeJourneyMail() {
  if (!journeyMail || !journeyMail.can_manage) return;
  if (!journeyMailPausedUntil()) { journeyMailRedraw(); return journeyMailRefresh(); }
  const ok = await ui.confirm({ title: t('jm_resume_q'), message: t('jm_resume_msg'), confirmLabel: t('jm_resume') });
  if (!ok) return;
  const res = await journeyMailSend(() => api.post('/api/journey/mail/resume', {}));
  if (!res || res.error) return journeyMailNote(journeyMailErrorText(res), true);
  journeyMail = res;
  journeyMailRedraw();
  ui.toast(t('jm_resumed'));
}

async function disconnectJourneyMail() {
  const email = (journeyMail && journeyMail.connection && journeyMail.connection.email) || '';
  const ok = await ui.confirm({ title: tf('jm_disconnect_q', { email }), message: t('jm_disconnect_msg'), confirmLabel: t('jm_disconnect'), danger: true });
  if (!ok) return;
  const res = await journeyMailSend(() => api.del('/api/journey/mail'));
  if (!res || res.error) return journeyMailNote(journeyMailErrorText(res), true);
  journeyMail = res;
  journeyMailRedraw();
  ui.toast(t('jm_disconnected'));
}
