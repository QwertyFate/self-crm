/* ═══════════════════════════════════════════════════════════════════════════
   MAILBOX — the E-Mail card under Settings → My preferences
   (EMAIL_SYNC_CHANGES Part 1, 2026-10-22; server: routes/mailbox.js).

   Each person connects their own Google mailbox. Connecting is a page
   navigation, not a fetch: the browser goes to /api/mailbox/google/start, on
   to Google's consent screen, and comes back to /?mailbox=<word>.
     • connectGoogleMailbox() remembers the open page first (core.js
       appRememberPage), so showApp() comes back to Settings
     • init() (auth.js) hands the address to mailboxKeepReturn() before
       showApp() clears it; that opens the My preferences tab
     • loadMailboxCard() then says how it went, once

   Part 1 is the connection only: nothing is read from the mailbox yet.
   The card is hidden from members while Google login is not set up on the
   server; owners and admins see why.
   ═══════════════════════════════════════════════════════════════════════════ */

// Email sync is on hold (2026-10-27): Settings neither asks for the mailbox nor shows the E-Mail card, for anyone.
// true shows it again, together with EMAIL_SYNC_ON in server.js, which mounts the routes.
const MAILBOX_SHOWN = false;
const MAILBOX_RETURNS = ['connected', 'denied', 'expired', 'scopes', 'taken', 'failed', 'not_configured'];
let mailboxData   = null;   // GET /api/mailbox: { configured, account }
let mailboxReturn = null;   // the word Google's round trip came back with, until it is shown

// init(): the word from the address; anything not in the list is ignored.
function mailboxKeepReturn(params) {
  const word = params.get('mailbox');
  mailboxReturn = MAILBOX_RETURNS.includes(word) ? word : null;
  if (mailboxReturn) currentSettingsTab = 'preferences';
}

async function loadMailboxCard(prefetched) {
  const res = prefetched || await api.get('/api/mailbox');
  mailboxData = res && !res.error ? res : { configured: false, account: null };
  renderMailboxCard();
  if (mailboxReturn) {
    ui.toast(t(`mb_ret_${mailboxReturn}`));
    mailboxReturn = null;
  }
}

function renderMailboxCard() {
  const card = document.getElementById('mailbox-card');
  const body = document.getElementById('mailbox-body');
  if (!card || !body) return;
  const { configured, account } = mailboxData || {};
  const canSeeSetup = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  card.classList.toggle('hidden', !configured && !account && !canSeeSetup);
  if (account) {
    body.innerHTML = `
      <p><strong>${esc(account.email_address)}</strong></p>
      <p class="settings-hint">${esc(tf('mb_connected_since', { date: fmtDate(account.connected_at) }))}</p>
      ${account.last_error ? `<p class="settings-hint text-danger">${esc(tf('mb_last_error', { error: account.last_error }))}</p>` : ''}
      <p class="settings-hint">${esc(t('mb_sync_pending'))}</p>
      <div class="settings-card-actions">
        <button class="btn btn-sm btn-danger" type="button" onclick="disconnectMailbox()">${esc(t('mb_disconnect'))}</button>
      </div>`;
  } else if (configured) {
    body.innerHTML = `
      <div class="settings-card-actions">
        <button class="btn btn-primary btn-sm" type="button" onclick="connectGoogleMailbox()">${esc(t('mb_connect_google'))}</button>
      </div>`;
  } else {
    body.innerHTML = `<p class="settings-hint">${esc(t('mb_not_configured'))}</p>`;
  }
}

// Google's screen cannot open inside a fetch: the whole tab goes there and comes back.
function connectGoogleMailbox() {
  appRememberPage();
  window.location.href = '/api/mailbox/google/start';
}

async function disconnectMailbox() {
  const email = mailboxData?.account?.email_address || '';
  const ok = await ui.confirm({ title: t('mb_disconnect'), message: tf('mb_confirm_disconnect', { email }), confirmLabel: t('mb_disconnect'), danger: true });
  if (!ok) return;
  const res = await api.del('/api/mailbox');
  if (!res || res.error) { ui.toast(res?.error || t('mb_ret_failed')); return; }
  mailboxData = res;
  renderMailboxCard();
  ui.toast(t('mb_disconnected'));
}
