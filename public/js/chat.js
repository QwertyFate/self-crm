/* ── Team chat ───────────────────────────────────────────────────────────────
   One room per workspace over Socket.IO. The transcript is the hero: day
   pills, author groups (avatar · name · time once per run), stacked bubbles,
   own messages on the right. Sending is honest (pending → sent → or failed
   with Retry), the view stays put when you have scrolled up, the connection
   state is visible, and a reconnect backfills what was missed.             */
let chatPageOpen    = false;
let chatMsgs        = [];          // every loaded message, ascending by id — the source of truth for the transcript
let chatSeen        = new Set();   // ids in the transcript (the room echoes our own acked messages)
let chatOldestId    = null;
let chatNewestId    = null;
let chatLoadingMore = false;
let chatHistoryDone = false;
let chatAtBottom    = true;
let chatUnreadFrom  = null;        // id of the first unread message when the page opened (the "Unread" divider)
let chatLast        = null;        // { userId, at } of the last rendered message: grouping continuity for live appends
let chatPendingSeq  = 0;
let chatReadTimer   = null;
let socket          = null;
let onlineUsers     = [];

/* ── Pure helpers ────────────────────────────────────────────────────────── */

// One of six hues per person, stable across sessions (hashed from the user id).
function chatHue(userId) {
  const n = Math.abs(parseInt(userId, 10));
  return Number.isFinite(n) ? n % 6 : 0;
}
function chatInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}
function chatLocale() {
  return (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'en-GB';
}
function chatSameDay(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
function chatTime(iso) {
  return new Date(iso).toLocaleTimeString(chatLocale(), { hour: '2-digit', minute: '2-digit' });
}
function chatDayLabel(iso, now = new Date()) { return dayLabelFor(iso, now); }
// Escape first, then turn http(s) URLs into links (trailing punctuation stays outside the link).
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, m => {
    const trail = (m.match(/[.,;:!?)]+$/) || [''])[0];
    const url = trail ? m.slice(0, -trail.length) : m;
    return `<a href="${url}" target="_blank" rel="noopener">${url}</a>${trail}`;
  });
}
// Where a message sits: after a day change, or a new author, or five quiet minutes, it starts a group.
function groupPlan(prev, msg) {
  const newDay = !prev || !chatSameDay(prev.at, msg.created_at);
  const newGroup = newDay || prev.userId !== msg.user_id || (new Date(msg.created_at) - new Date(prev.at)) > 5 * 60 * 1000;
  return { newDay, newGroup };
}
function canSend(text, connected) {
  const s = String(text || '').trim();
  return !!s && s.length <= 2000 && !!connected;
}
function chatCounter(text) {
  const len = String(text || '').length;
  return { show: len >= 1800, left: 2000 - len, over: len > 2000 };
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

function daySepHtml(iso) { return `<div class="chat-day-sep"><span>${esc(chatDayLabel(iso))}</span></div>`; }
function unreadSepHtml() { return `<div class="chat-unread-sep"><span>${t('chat_unread_divider')}</span></div>`; }
function historyStartHtml() { return `<div class="chat-history-start">${t('chat_history_start')}</div>`; }
function emptyHtml() {
  return `<div class="chat-empty"><div class="chat-empty-title">${t('chat_empty_title')}</div><div class="chat-empty-hint">${t('chat_empty_hint')}</div></div>`;
}
function chatErrorLabel(reason) {
  return reason === 'too_long' ? t('chat_too_long') : reason === 'rate_limited' ? t('chat_rate_limited') : t('chat_not_sent');
}
function messageHtml(msg, plan) {
  const me = msg.user_id === currentUser?.id;
  const state = msg.pending ? ' pending' : msg.failed ? ' failed' : '';
  const stamp = new Date(msg.created_at);
  const time = `<time class="chat-time" datetime="${esc(msg.created_at)}" title="${esc(stamp.toLocaleString(chatLocale()))}">${esc(chatTime(msg.created_at))}</time>`;
  return `<div class="chat-msg${me ? ' me' : ''}${plan.newGroup ? ' first' : ''}${state}" data-id="${esc(msg.id)}" data-user="${esc(msg.user_id)}" data-created="${esc(msg.created_at)}">
    ${!me ? (plan.newGroup ? `<div class="chat-avatar hue-${chatHue(msg.user_id)}" aria-hidden="true">${esc(chatInitials(msg.user_name))}</div>` : '<div class="chat-gutter"></div>') : ''}
    <div class="chat-msg-body">
      ${plan.newGroup ? `<div class="chat-msg-head"><span class="chat-author">${me ? t('chat_you') : esc(msg.user_name)}</span>${time}</div>` : ''}
      <div class="chat-bubble">${linkify(msg.content)}</div>
      ${plan.newGroup ? '' : `<div class="chat-msg-side">${time}</div>`}
      ${msg.failed ? `<div class="chat-msg-error"><span>${esc(chatErrorLabel(msg.failed))}</span><button type="button" class="btn btn-sm btn-ghost" onclick="retryChatMessage('${esc(msg.id)}')">${t('chat_retry')}</button></div>` : ''}
    </div>
  </div>`;
}
// Draw the whole transcript from chatMsgs (initial load and after a page of older messages).
function renderTranscript() {
  const el = document.getElementById('chat-page-messages'); if (!el) return;
  if (!chatMsgs.length) { el.innerHTML = emptyHtml(); chatLast = null; return; }
  let html = chatHistoryDone ? historyStartHtml() : '';
  let prev = null;
  for (const m of chatMsgs) {
    const plan = groupPlan(prev, m);
    if (plan.newDay) html += daySepHtml(m.created_at);
    if (chatUnreadFrom && m.id === chatUnreadFrom) html += unreadSepHtml();
    html += messageHtml(m, plan);
    prev = { userId: m.user_id, at: m.created_at };
  }
  el.innerHTML = html;
  chatLast = prev;
}
// Live messages go on the end, continuing the last group where they belong.
function appendMessages(list) {
  const el = document.getElementById('chat-page-messages'); if (!el) return 0;
  let added = 0;
  for (const m of list) {
    if (!m.pending && chatSeen.has(m.id)) continue;
    if (!chatMsgs.length) el.innerHTML = chatHistoryDone ? historyStartHtml() : '';
    el.querySelector('.chat-empty')?.remove();
    const plan = groupPlan(chatLast, m);
    chatMsgs.push(m);
    if (!m.pending) chatSeen.add(m.id);
    el.insertAdjacentHTML('beforeend', (plan.newDay ? daySepHtml(m.created_at) : '') + messageHtml(m, plan));
    chatLast = { userId: m.user_id, at: m.created_at };
    added++;
  }
  return added;
}
// Older messages go on the front; the transcript is redrawn so groups and day pills stay right, the view stays put.
function prependMessages(list) {
  const el = document.getElementById('chat-page-messages'); if (!el) return;
  const fresh = list.filter(m => !chatSeen.has(m.id));
  fresh.forEach(m => chatSeen.add(m.id));
  chatMsgs = fresh.concat(chatMsgs);
  const fromBottom = el.scrollHeight - el.scrollTop;
  renderTranscript();
  el.scrollTop = el.scrollHeight - fromBottom;
}
async function loadOlderMessages() {
  if (chatLoadingMore || chatHistoryDone || !chatOldestId) return;
  chatLoadingMore = true;
  const el = document.getElementById('chat-page-messages');
  el?.insertAdjacentHTML('afterbegin', `<div class="chat-loading-older">${t('chat_loading_older')}</div>`);
  const data = await apiFetchSilent(`/api/chat/messages?before=${chatOldestId}`);
  el?.querySelector('.chat-loading-older')?.remove();
  const list = Array.isArray(data?.messages) ? data.messages : [];
  if (list.length < 50) chatHistoryDone = true;
  if (list.length) { chatOldestId = list[0].id; prependMessages(list); }
  else if (chatHistoryDone && el && !el.querySelector('.chat-history-start')) el.insertAdjacentHTML('afterbegin', historyStartHtml());
  chatLoadingMore = false;
}

/* ── Scrolling ───────────────────────────────────────────────────────────── */

function scrollChatPageBottom() {
  const el = document.getElementById('chat-page-messages');
  if (el) el.scrollTop = el.scrollHeight;
  chatAtBottom = true;
  hideJump();
}
function showJump() {
  const b = document.getElementById('chat-jump'); if (!b) return;
  b.innerHTML = `${UI_ICON.arrowDown}<span>${t('chat_new_messages')}</span>`;
  b.classList.remove('hidden');
}
function hideJump() { document.getElementById('chat-jump')?.classList.add('hidden'); }
function jumpToLatest() { scrollChatPageBottom(); markChatRead(); }

/* ── Presence, badge, connection ─────────────────────────────────────────── */

function renderPresence() {
  const el = document.getElementById('chat-presence'); if (!el) return;
  const users = Array.isArray(onlineUsers) ? onlineUsers : [];
  const avatars = users.slice(0, 5).map(u => `<span class="chat-avatar hue-${chatHue(u.id)}">${esc(chatInitials(u.name))}</span>`).join('');
  const more = users.length > 5 ? `<span class="chat-avatar chat-avatar-more">+${users.length - 5}</span>` : '';
  const label = users.length === 0 ? t('chat_nobody_online') : users.length === 1 ? t('chat_online_one') : t('chat_online_n').replace('{n}', users.length);
  el.innerHTML = `<div class="chat-presence-avatars" aria-hidden="true">${avatars}${more}</div><span class="chat-presence-count">${esc(label)}</span>`;
  el.title = users.map(u => u.name).join(', ');
}
function updateChatBadge(count) {
  const badge = document.getElementById('chat-badge'); if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', !count);
}
async function refreshChatBadge() {
  try {
    const data = await apiFetchSilent('/api/chat/unread');
    if (data && !data.error) updateChatBadge(data.unread);
  } catch { /* silent */ }
}
function setChatConnection(up) {
  const b = document.getElementById('chat-connection');
  if (b) { b.textContent = t('chat_reconnecting'); b.classList.toggle('hidden', up); }
  updateSendState();
}
// Mark the room read (quietly: no loader bar), at most once per burst, and only while the page is open.
function markChatRead() {
  if (!chatPageOpen) return;
  clearTimeout(chatReadTimer);
  chatReadTimer = setTimeout(() => {
    apiFetchSilent('/api/chat/read', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    updateChatBadge(0);
  }, 600);
}

/* ── Socket ──────────────────────────────────────────────────────────────── */

function initChatSocket() {
  if (socket) return;
  socket = io();
  socket.on('connect', async () => {
    setChatConnection(true);
    renderPresence();
    if (chatPageOpen && chatNewestId) {                                  // backfill what was missed while disconnected
      const data = await apiFetchSilent(`/api/chat/messages?after=${chatNewestId}`);
      if (Array.isArray(data?.messages) && data.messages.length) receiveMessages(data.messages);
    }
  });
  socket.on('disconnect', () => setChatConnection(false));
  socket.on('connect_error', () => setChatConnection(false));
  socket.on('online_users', users => { onlineUsers = Array.isArray(users) ? users : []; renderPresence(); });
  socket.on('new_message', msg => {
    if (chatPageOpen) receiveMessages([msg]);
    else refreshChatBadge();
  });
}
// Messages from the room: our own echo confirms a pending one; the rest are appended, without yanking a reader who scrolled up.
function receiveMessages(list) {
  let added = 0, mine = false;
  for (const msg of list) {
    if (resolvePending(msg)) { mine = true; continue; }
    if (chatSeen.has(msg.id)) continue;
    added += appendMessages([msg]);
    if (!chatNewestId || msg.id > chatNewestId) chatNewestId = msg.id;
  }
  if (!added && !mine) return;
  if (chatAtBottom || mine) scrollChatPageBottom(); else showJump();
  if (chatAtBottom) markChatRead();
}

/* ── Sending ─────────────────────────────────────────────────────────────── */

function sendChatMessageFromPage() {
  const input = document.getElementById('chat-page-input'); if (!input) return;
  const content = input.value.trim();
  const connected = !!socket?.connected;
  if (!canSend(content, connected)) {
    if (content && !connected) showChatNotice(t('chat_offline'));        // the draft stays in the box
    else if (content.length > 2000) showChatNotice(t('chat_too_long'));
    return;
  }
  hideChatNotice();
  const msg = { id: `tmp-${++chatPendingSeq}`, content, created_at: new Date().toISOString(), user_id: currentUser?.id, user_name: currentUser?.name, pending: true };
  input.value = ''; autosizeChatInput(); updateSendState();
  appendMessages([msg]);
  scrollChatPageBottom();
  emitChatMessage(msg);
}
// Emit with an ack; no ack within eight seconds counts as a failure the user can retry.
function emitChatMessage(msg) {
  let done = false;
  const finish = res => {
    if (done) return; done = true; clearTimeout(timer);
    if (res?.ok) confirmPending(msg, res); else failPending(msg, res?.error || 'failed');
  };
  const timer = setTimeout(() => finish({ error: 'timeout' }), 8000);
  if (!socket?.connected) { finish({ error: 'offline' }); return; }
  socket.emit('chat_message', msg.content, finish);
}
function pendingEl(msg) { return document.querySelector(`#chat-page-messages .chat-msg[data-id="${CSS.escape(String(msg.id))}"]`); }
function confirmPending(msg, res) {
  const el = pendingEl(msg);
  msg.id = res.id; msg.pending = false; msg.failed = null;
  if (res.created_at) msg.created_at = res.created_at;
  chatSeen.add(res.id);
  if (!chatNewestId || res.id > chatNewestId) chatNewestId = res.id;
  if (el) { el.dataset.id = String(res.id); el.classList.remove('pending', 'failed'); el.querySelector('.chat-msg-error')?.remove(); }
}
function failPending(msg, reason) {
  msg.pending = false; msg.failed = reason;
  const el = pendingEl(msg); if (!el) return;
  el.classList.remove('pending'); el.classList.add('failed');
  el.querySelector('.chat-msg-error')?.remove();
  el.querySelector('.chat-msg-body')?.insertAdjacentHTML('beforeend',
    `<div class="chat-msg-error"><span>${esc(chatErrorLabel(reason))}</span><button type="button" class="btn btn-sm btn-ghost" onclick="retryChatMessage('${esc(msg.id)}')">${t('chat_retry')}</button></div>`);
}
function retryChatMessage(tempId) {
  const msg = chatMsgs.find(m => String(m.id) === String(tempId)); if (!msg) return;
  const el = pendingEl(msg);
  msg.pending = true; msg.failed = null;
  if (el) { el.classList.remove('failed'); el.classList.add('pending'); el.querySelector('.chat-msg-error')?.remove(); }
  emitChatMessage(msg);
}
// The room echoes our own message; if one of ours is still pending with that text, that echo is its confirmation.
function resolvePending(msg) {
  if (msg.user_id !== currentUser?.id) return false;
  const p = chatMsgs.find(m => m.pending && m.content === msg.content);
  if (!p) return false;
  confirmPending(p, { id: msg.id, created_at: msg.created_at });
  return true;
}

/* ── Composer ────────────────────────────────────────────────────────────── */

function initChatComposer() {
  const input = document.getElementById('chat-page-input'); if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessageFromPage(); } });
  input.addEventListener('input', () => { autosizeChatInput(); updateSendState(); });
  document.getElementById('chat-page-send')?.addEventListener('click', sendChatMessageFromPage);
  document.getElementById('chat-jump')?.addEventListener('click', jumpToLatest);
}
function autosizeChatInput() {
  const input = document.getElementById('chat-page-input'); if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}
function updateSendState() {
  const input = document.getElementById('chat-page-input'), send = document.getElementById('chat-page-send'), counter = document.getElementById('chat-counter');
  if (!input) return;
  const c = chatCounter(input.value);
  if (send) send.disabled = !canSend(input.value, !!socket?.connected);
  if (counter) {
    counter.classList.toggle('hidden', !c.show);
    counter.classList.toggle('over', c.over);
    counter.textContent = t('chat_chars_left').replace('{n}', c.left);
  }
}
function showChatNotice(text) { const n = document.getElementById('chat-notice'); if (n) { n.textContent = text; n.classList.remove('hidden'); } }
function hideChatNotice() { document.getElementById('chat-notice')?.classList.add('hidden'); }

/* ── Page lifecycle ──────────────────────────────────────────────────────── */

async function loadChatPage() {
  chatPageOpen = true;
  chatMsgs = []; chatSeen = new Set(); chatOldestId = chatNewestId = null;
  chatLoadingMore = false; chatHistoryDone = false; chatAtBottom = true; chatUnreadFrom = null; chatLast = null;
  if (!socket) initChatSocket();
  initChatComposer(); renderPresence(); hideJump(); hideChatNotice(); updateSendState();
  const el = document.getElementById('chat-page-messages'); if (!el) return;
  el.innerHTML = `<div class="chat-empty"><div class="chat-empty-hint">${t('loading')}</div></div>`;
  const [data, unread] = await Promise.all([apiFetchSilent('/api/chat/messages'), apiFetchSilent('/api/chat/unread')]);
  if (!data || data.error || !Array.isArray(data.messages)) {
    el.innerHTML = `<div class="chat-empty"><div class="chat-empty-title">${t('chat_load_error')}</div><button type="button" class="btn btn-sm" onclick="loadChatPage()">${t('chat_retry')}</button></div>`;
    return;
  }
  const list = data.messages;
  chatMsgs = list; list.forEach(m => chatSeen.add(m.id));
  chatOldestId = list[0]?.id || null; chatNewestId = list[list.length - 1]?.id || null;
  chatHistoryDone = list.length < 50;
  const n = Number(unread?.unread) || 0;
  chatUnreadFrom = n > 0 && n <= list.length ? list[list.length - n].id : null;
  renderTranscript();
  scrollChatPageBottom();
  el.onscroll = () => {
    chatAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (chatAtBottom) hideJump();
    if (el.scrollTop < 80) loadOlderMessages();
  };
  markChatRead();
  document.getElementById('chat-page-input')?.focus();
}
// Leaving the page: stop treating the room as read while the user is elsewhere.
function leaveChatPage() {
  chatPageOpen = false;
  clearTimeout(chatReadTimer);
}
