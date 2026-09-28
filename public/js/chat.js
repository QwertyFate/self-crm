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
let chatDraftMentions = [];        // { kind, id, label } picked with /deal or /contact in the current draft ("@Label" in the box)
let chatLinkCache     = null;      // { deal: [...], contact: [...] } of { kind, id, label, meta }; loaded on the first "/"
let chatSlash         = null;      // the open slash menu: { mode: 'commands' | 'deal' | 'contact', query, start, rows, active }

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

/* ── Mentions: /deal and /contact ───────────────────────────────────────────
   A picked record sits in the draft as "@Label" and is sent as
   [[deal:12|Label]] or [[contact:7|Label]]. The transcript renders that token
   as a link that opens the record. The server stores the string verbatim.  */

// What the caret is on: a bare "/" (the command list), "/deal q" or "/contact q" (a record list), or nothing.
function parseSlashCommand(text, caret) {
  const before = String(text || '').slice(0, caret);
  const rec = before.match(/(?:^|\s)\/(deal|contact)(?:[ \t]([^\n]*))?$/i);
  if (rec) return { mode: rec[1].toLowerCase(), query: (rec[2] || '').trim(), start: before.length - rec[0].trimStart().length };
  const cmd = before.match(/(?:^|\s)\/([a-z]*)$/i);
  if (!cmd) return null;
  const query = cmd[1].toLowerCase();
  if (!['deal', 'contact'].some(k => k.startsWith(query))) return null;
  return { mode: 'commands', query, start: before.length - cmd[0].trimStart().length };
}
function filterChatRefs(items, query, limit = 8) {
  const q = String(query || '').toLowerCase().trim();
  const hit = i => !q || i.label.toLowerCase().includes(q) || String(i.meta || '').toLowerCase().includes(q);
  return (items || []).filter(hit).slice(0, limit);
}
// A label that survives the token syntax: no brackets, pipes or line breaks, at most 120 characters.
function chatRefLabel(label) {
  return String(label || '').replace(/[[\]|\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}
function chatRefToken(kind, id, label) {
  return `[[${kind}:${Number(id)}|${chatRefLabel(label) || kind}]]`;
}
// Draft "@Label" mentions become tokens; a label the user has edited stays plain text.
function encodeChatMentions(text, drafts) {
  let out = String(text || '');
  const list = [...(drafts || [])].sort((a, b) => b.label.length - a.label.length);
  for (const d of list) {
    const at = '@' + d.label;
    const idx = out.indexOf(at);
    if (idx < 0) continue;
    out = out.slice(0, idx) + chatRefToken(d.kind, d.id, d.label) + out.slice(idx + at.length);
  }
  return out;
}
function chatRefHtml(kind, id, label) {
  const badge = kind === 'deal' ? UI_ICON.folder : `<span class="chat-ref-avatar" aria-hidden="true">${esc(chatInitials(label))}</span>`;
  const title = t(kind === 'deal' ? 'chat_ref_deal' : 'chat_ref_contact');
  return `<a href="#" class="chat-ref chat-ref-${kind}" data-kind="${kind}" data-id="${Number(id)}" title="${esc(title)}">${badge}<span>${esc(label)}</span></a>`;
}
// Escape and linkify the plain runs; turn [[deal:12|Label]] tokens into record links.
function renderMessageBody(content) {
  const src = String(content || '');
  let out = '', last = 0;
  for (const m of src.matchAll(/\[\[(deal|contact):(\d+)\|([^\]|\n]{1,120})\]\]/g)) {
    out += linkify(src.slice(last, m.index)) + chatRefHtml(m[1], m[2], m[3]);
    last = m.index + m[0].length;
  }
  return out + linkify(src.slice(last));
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
      <div class="chat-bubble">${renderMessageBody(msg.content)}</div>
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
  const content = encodeChatMentions(input.value.trim(), chatDraftMentions);   // "@Label" drafts go out as [[kind:id|Label]] tokens
  const connected = !!socket?.connected;
  if (!canSend(content, connected)) {
    if (content && !connected) showChatNotice(t('chat_offline'));        // the draft stays in the box
    else if (content.length > 2000) showChatNotice(t('chat_too_long'));
    return;
  }
  hideChatNotice();
  const msg = { id: `tmp-${++chatPendingSeq}`, content, created_at: new Date().toISOString(), user_id: currentUser?.id, user_name: currentUser?.name, pending: true };
  input.value = ''; chatDraftMentions = []; closeSlashMenu(); autosizeChatInput(); updateSendState();
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
  input.addEventListener('keydown', e => {
    if (chatSlashKeydown(e)) return;                                   // the slash menu owns arrows, Enter, Tab and Escape while open
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessageFromPage(); }
  });
  input.addEventListener('input', () => { autosizeChatInput(); updateSendState(); checkChatSlash(); });
  input.addEventListener('blur', () => setTimeout(closeSlashMenu, 120));
  document.getElementById('chat-page-send')?.addEventListener('click', sendChatMessageFromPage);
  document.getElementById('chat-jump')?.addEventListener('click', jumpToLatest);
  // Record links in the transcript: one delegated handler, no inline onclick in the message templates.
  document.getElementById('chat-page-messages')?.addEventListener('click', e => {
    const ref = e.target.closest('.chat-ref'); if (!ref) return;
    e.preventDefault();
    openChatRef(ref.dataset.kind, ref.dataset.id);
  });
}
// A deal opens its modal; a contact opens its detail view (a modal off the Contacts page). No switchPage: it would drop the transcript.
function openChatRef(kind, id) {
  const n = Number(id); if (!n) return;
  if (kind === 'deal') openDealModal(n);
  else if (kind === 'contact') openDetail(n);
}

/* ── Slash menu: /deal and /contact ─────────────────────────────────────── */

async function ensureChatLinkOptions() {
  if (chatLinkCache) return chatLinkCache;
  const [dealsRes, contactsRes] = await Promise.all([apiFetchSilent('/api/deals'), apiFetchSilent('/api/contacts?contact_type=contact')]);
  const dealRows = Array.isArray(dealsRes) ? dealsRes : [], contactRows = Array.isArray(contactsRes) ? contactsRes : [];
  chatLinkCache = {
    deal:    dealRows.map(d => ({ kind: 'deal', id: d.id, label: chatRefLabel(d.title), meta: [d.contact_name, d.stage_name].filter(Boolean).join(' · ') })).filter(r => r.label),
    contact: contactRows.map(c => ({ kind: 'contact', id: c.id, label: chatRefLabel(c.name), meta: [c.company, c.email].filter(Boolean).join(' · ') })).filter(r => r.label),
  };
  return chatLinkCache;
}
function slashMenuEl() { return document.getElementById('chat-slash-menu'); }
function closeSlashMenu() { chatSlash = null; slashMenuEl()?.remove(); }
async function checkChatSlash() {
  const input = document.getElementById('chat-page-input'); if (!input) return;
  let parsed = parseSlashCommand(input.value, input.selectionStart);
  if (!parsed) { closeSlashMenu(); return; }
  let rows;
  if (parsed.mode === 'commands') {
    rows = ['deal', 'contact'].filter(k => k.startsWith(parsed.query))
      .map(k => ({ kind: 'command', id: k, label: `/${k}`, meta: t(k === 'deal' ? 'chat_cmd_deal_hint' : 'chat_cmd_contact_hint') }));
  } else {
    const cache = await ensureChatLinkOptions();
    parsed = parseSlashCommand(input.value, input.selectionStart);     // the draft may have moved on while the lists loaded
    if (!parsed) { closeSlashMenu(); return; }
    if (parsed.mode === 'commands') return;                             // a later keystroke already drew the command list
    rows = filterChatRefs(cache[parsed.mode], parsed.query);
  }
  const active = chatSlash?.mode === parsed.mode ? Math.min(chatSlash.active, Math.max(rows.length - 1, 0)) : 0;
  chatSlash = { ...parsed, rows, active };
  renderSlashMenu();
}
function renderSlashMenu() {
  const host = document.querySelector('.chat-composer-row'); if (!host || !chatSlash) return;
  let el = slashMenuEl();
  if (!el) {
    el = document.createElement('div');
    el.id = 'chat-slash-menu'; el.className = 'chat-slash-menu mention-autocomplete'; el.setAttribute('role', 'listbox');
    el.addEventListener('mousedown', e => e.preventDefault());        // keep the textarea focused
    el.addEventListener('click', e => { const item = e.target.closest('.mention-item[data-idx]'); if (item && chatSlash) pickSlashRow(chatSlash.rows[Number(item.dataset.idx)]); });
    host.appendChild(el);
  }
  const { rows, active } = chatSlash;
  const lead = r => r.kind === 'command' ? `<span class="chat-slash-cmd">${esc(r.label)}</span>`
    : r.kind === 'deal' ? `<span class="chat-slash-kind" aria-hidden="true">${UI_ICON.folder}</span>`
    : `<span class="mention-item-avatar" aria-hidden="true">${esc(chatInitials(r.label))}</span>`;
  el.innerHTML = rows.length
    ? rows.map((r, i) => `<div class="mention-item${i === active ? ' active' : ''}" role="option" aria-selected="${i === active}" data-idx="${i}">
        ${lead(r)}
        <span class="chat-slash-text"><span class="mention-item-name">${esc(r.kind === 'command' ? r.meta : r.label)}</span>${r.kind !== 'command' && r.meta ? `<span class="chat-slash-meta">${esc(r.meta)}</span>` : ''}</span>
      </div>`).join('')
    : `<div class="mention-item chat-slash-empty">${esc(t('no_matches'))}</div>`;
  el.querySelector('.mention-item.active')?.scrollIntoView({ block: 'nearest' });
}
function moveSlashActive(delta) {
  if (!chatSlash?.rows.length) return;
  chatSlash.active = (chatSlash.active + delta + chatSlash.rows.length) % chatSlash.rows.length;
  renderSlashMenu();
}
// True when the key was consumed by the menu (so Enter does not send while it is open).
function chatSlashKeydown(e) {
  if (!chatSlash) return false;
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSlashActive(1); return true; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); moveSlashActive(-1); return true; }
  if (e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); closeSlashMenu(); return true; }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    if (chatSlash.rows.length) pickSlashRow(chatSlash.rows[chatSlash.active]); else closeSlashMenu();
    return true;
  }
  return false;
}
// Replace the "/deal query" text with the pick: a command becomes "/deal " (straight into its list), a record becomes "@Label ".
function pickSlashRow(row) {
  const input = document.getElementById('chat-page-input'); if (!input || !chatSlash || !row) return;
  const { start } = chatSlash;
  const caret = input.selectionStart;
  let insert;
  if (row.kind === 'command') insert = `/${row.id} `;
  else { insert = `@${row.label} `; chatDraftMentions.push({ kind: row.kind, id: row.id, label: row.label }); }
  input.value = input.value.slice(0, start) + insert + input.value.slice(caret);
  const pos = start + insert.length;
  input.setSelectionRange(pos, pos);
  input.focus();
  closeSlashMenu();
  autosizeChatInput(); updateSendState();
  if (row.kind === 'command') checkChatSlash();
}
function autosizeChatInput() {
  const input = document.getElementById('chat-page-input'); if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}
function updateSendState() {
  const input = document.getElementById('chat-page-input'), send = document.getElementById('chat-page-send'), counter = document.getElementById('chat-counter');
  if (!input) return;
  const encoded = encodeChatMentions(input.value, chatDraftMentions);   // the cap applies to what is actually sent
  const c = chatCounter(encoded);
  if (send) send.disabled = !canSend(encoded, !!socket?.connected);
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
  closeSlashMenu(); chatDraftMentions = []; chatLinkCache = null;
}
