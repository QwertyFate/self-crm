let chatOpen         = false;
let chatPageOpen     = false;
let chatOldestId     = null;
let chatNewestId     = null;
let chatLoadingMore  = false;
let socket           = null;
let onlineUsers      = [];

// Send recovery. Each send carries a Socket.IO ack callback, so the closure
// that emitted a message is the one that hears back about it — no queue is
// needed to match replies to sends. The server answers every send with
// { ok: true } or { ok: false, reason } (rate_limited | invalid | server_error),
// and socket.timeout() turns "no answer at all" into an error.
const CHAT_ACK_TIMEOUT_MS = 5000;
let chatRateBlocked    = false;
let chatRateDeadline   = 0;
let chatRateTimer      = null;
let chatNoticeTimer    = null;

function chatAvatar(name) {
  return (name || '?')[0].toUpperCase();
}

function chatTimeLabel(dateStr) {
  const d    = new Date(dateStr);
  const now  = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth()    === db.getMonth()    &&
         da.getDate()     === db.getDate();
}

function dayLabel(dateStr) {
  const d   = new Date(dateStr);
  const now = new Date();
  if (isSameDay(d, now)) return 'Today';
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (isSameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function renderMessages(messages, prepend = false) {
  const el       = document.getElementById('chat-messages');
  if (!el) return;

  const myId     = currentUser?.id;
  const prevScroll = el.scrollHeight - el.scrollTop;

  let html = '';
  let lastDate = null;
  let lastUser = null;

  messages.forEach((msg, i) => {
    const isMe    = msg.user_id === myId;
    const msgDate = msg.created_at;

    if (!lastDate || !isSameDay(lastDate, msgDate)) {
      html += `<div class="chat-day-sep"><span>${dayLabel(msgDate)}</span></div>`;
      lastUser = null;
    }
    lastDate = msgDate;

    const grouped = lastUser === msg.user_id;
    lastUser = msg.user_id;

    html += `
      <div class="chat-msg${isMe ? ' me' : ''}${grouped ? ' grouped' : ''}" data-id="${msg.id}">
        ${!isMe && !grouped ? `<div class="chat-avatar">${chatAvatar(msg.user_name)}</div>` : ''}
        ${!isMe && grouped  ? `<div class="chat-avatar-spacer"></div>` : ''}
        <div class="chat-bubble-wrap">
          ${!grouped ? `<div class="chat-meta">${isMe ? 'You' : esc(msg.user_name)} <span class="chat-time">${chatTimeLabel(msg.created_at)}</span></div>` : ''}
          <div class="chat-bubble">${esc(msg.content)}</div>
        </div>
      </div>`;
  });

  if (prepend) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    el.insertBefore(tempDiv, el.firstChild);
    el.scrollTop = el.scrollHeight - prevScroll;
  } else {
    el.querySelector('.chat-loading')?.remove();
    el.innerHTML += html;
  }
}

async function loadOlderMessages() {
  chatLoadingMore = true;
  const data = await apiFetchSilent(`/api/chat/messages?before=${chatOldestId}`);
  if (data?.messages?.length) {
    renderMessagesToPage(data.messages, true);
    chatOldestId = data.messages[0].id;
  }
  chatLoadingMore = false;
}

function scrollChatBottom() {
  const el = document.getElementById('chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function updateChatBadge(count) {
  const badge = document.getElementById('chat-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
}

async function refreshChatBadge() {
  try {
    const data = await apiFetchSilent('/api/chat/unread');
    if (data && !data.error) updateChatBadge(data.unread);
  } catch { /* silent */ }
}

function initChatSocket() {
  if (socket) return;

  socket = io();

  socket.on('connect', () => {
    renderPageOnlineUsers();
  });

  socket.on('connect_error', (error) => {
    console.error('Chat socket connection error:', error);
  });

  socket.on('online_users', (users) => {
    onlineUsers = users;
    renderPageOnlineUsers();
  });

  socket.on('new_message', (msg) => {
    const pageEl = document.getElementById('chat-page-messages');
    if (pageEl && chatPageOpen) {
      pageEl.querySelector('.chat-empty')?.remove();
      renderMessagesToPage([msg]);

      if (!chatNewestId || msg.id > chatNewestId) {
        chatNewestId = msg.id;
      }

      setTimeout(() => scrollChatPageBottom(), 50);

      api.patch('/api/chat/read', {});
      updateChatBadge(0);
    }

    if (!chatPageOpen) {
      apiFetchSilent('/api/chat/unread').then(data => {
        if (data && !data.error) updateChatBadge(data.unread);
      });
    }
  });
}

function renderOnlineUsers() {
  const bar = document.getElementById('chat-online-bar');
  if (!bar) return;

  if (!onlineUsers.length) {
    bar.innerHTML = '<span style="color:var(--muted);font-size:12px">No one online</span>';
    return;
  }

  let html = '<span style="color:var(--muted);font-size:12px">Online: </span>';
  onlineUsers.forEach(user => {
    html += `<div class="chat-online-item"><div class="chat-online-dot"></div>${esc(user.name)}</div>`;
  });
  bar.innerHTML = html;
}

function renderPageOnlineUsers() {
  const bar = document.getElementById('chat-page-online-bar');
  if (!bar) return;

  if (!onlineUsers.length) {
    bar.innerHTML = '<span style="color:var(--muted);font-size:12px">No one online</span>';
    return;
  }

  let html = '<span style="color:var(--muted);font-size:12px">Online: </span>';
  onlineUsers.forEach(user => {
    html += `<div class="chat-online-item"><div class="chat-online-dot"></div>${esc(user.name)}</div>`;
  });
  bar.innerHTML = html;
}

async function loadChatPage() {
  chatPageOpen = true;
  chatOldestId = null;
  chatNewestId = null;
  chatLoadingMore = false;

  if (!socket) initChatSocket();

  const el = document.getElementById('chat-page-messages');
  if (!el) return;

  try {
    const data = await api.get('/api/chat/messages');
    if (!data || data.error) {
      el.innerHTML = '<div class="chat-empty">Could not load messages.</div>';
      return;
    }

    if (!data.messages || !data.messages.length) {
      el.innerHTML = '<div class="chat-empty">No messages yet. Say hello to your team!</div>';
    } else {
      el.innerHTML = '';
      renderMessagesToPage(data.messages);
      chatOldestId = data.messages[0].id;
      chatNewestId = data.messages[data.messages.length - 1].id;
      scrollChatPageBottom();
    }

    api.patch('/api/chat/read', {});
    updateChatBadge(0);

    const pageEl = document.getElementById('chat-page-messages');
    if (pageEl) {
      pageEl.onscroll = () => {
        if (pageEl.scrollTop < 60 && !chatLoadingMore && chatOldestId) loadOlderMessages();
      };
    }
  } catch (err) {
    console.error('Error in loadChatPage:', err);
    el.innerHTML = '<div class="chat-empty">Error loading messages.</div>';
  }
}

async function renderChatRoom() {
  if (!chatPageOpen) chatPageOpen = true;
  const el = document.getElementById('chat-page-messages');
  if (!el) return;
  chatOldestId = null;
  chatNewestId = null;
  chatLoadingMore = false;
  if (!socket) initChatSocket();
  el.innerHTML = '<div class="chat-empty">Loading…</div>';
  try {
    const data = await api.get('/api/chat/messages');
    if (!data || data.error || !data.messages) {
      el.innerHTML = '<div class="chat-empty">Could not load messages.</div>';
      return;
    }
    el.innerHTML = data.messages.length
      ? ''
      : '<div class="chat-empty">No messages yet. Say hello to your team!</div>';
    if (data.messages.length) {
      renderMessagesToPage(data.messages);
      chatOldestId = data.messages[0].id;
      chatNewestId = data.messages[data.messages.length - 1].id;
      scrollChatPageBottom();
    }
    api.patch('/api/chat/read', {});
    updateChatBadge(0);
  } catch (err) {
    console.error('Error in renderChatRoom:', err);
    el.innerHTML = '<div class="chat-empty">Error loading messages.</div>';
  }
}

function renderMessagesToPage(messages, prepend = false) {
  const el = document.getElementById('chat-page-messages');
  if (!el) return;

  const myId = currentUser?.id;
  const prevScroll = el.scrollHeight - el.scrollTop;

  let html = '';
  let lastDate = null;
  let lastUser = null;

  if (!prepend && el.innerHTML) {
    const lastMsg = el.querySelectorAll('.chat-msg:not(.chat-day-sep)');
    if (lastMsg.length > 0) {
      const lastMsgEl = lastMsg[lastMsg.length - 1];
      const prevDaySep = lastMsgEl.previousElementSibling;
      if (prevDaySep && prevDaySep.classList.contains('chat-day-sep')) {
        lastDate = new Date(lastMsgEl.getAttribute('data-created') || new Date());
      }
    }
  }

  messages.forEach((msg) => {
    const isMe = msg.user_id === myId;
    const msgDate = msg.created_at;

    if (!lastDate || !isSameDay(lastDate, msgDate)) {
      html += `<div class="chat-day-sep"><span>${dayLabel(msgDate)}</span></div>`;
      lastUser = null;
      lastDate = msgDate;
    }

    const grouped = lastUser === msg.user_id;
    lastUser = msg.user_id;

    html += `
      <div class="chat-msg${isMe ? ' me' : ''}${grouped ? ' grouped' : ''}" data-id="${msg.id}" data-created="${msg.created_at}">
        ${!isMe && !grouped ? `<div class="chat-avatar">${chatAvatar(msg.user_name)}</div>` : ''}
        ${!isMe && grouped ? `<div class="chat-avatar-spacer"></div>` : ''}
        <div class="chat-bubble-wrap">
          ${!grouped ? `<div class="chat-meta">${isMe ? 'You' : esc(msg.user_name)} <span class="chat-time">${chatTimeLabel(msg.created_at)}</span></div>` : ''}
          <div class="chat-bubble">${esc(msg.content)}</div>
        </div>
      </div>`;
  });

  if (prepend) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    el.insertBefore(tempDiv, el.firstChild);
    el.scrollTop = el.scrollHeight - prevScroll;
  } else {
    el.innerHTML += html;
  }
}

function scrollChatPageBottom() {
  const el = document.getElementById('chat-page-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function sendChatMessageFromPage() {
  if (chatRateBlocked) return;

  const input = document.getElementById('chat-page-input');
  const content = input.value.trim();
  if (!content) return;

  if (!socket?.connected) {
    console.error('Socket not connected');
    return;
  }

  input.value = '';
  // Request/response: the ack callback receives THIS send's outcome, so the
  // text to restore is simply the closure's own `content`. A successful send
  // is rendered from the new_message broadcast like everyone else's — the ack
  // is only for restore and feedback.
  socket.timeout(CHAT_ACK_TIMEOUT_MS).emit('chat_message', content, (err, reply) => {
    if (!err && reply?.ok) return;
    restoreChatInput(content);
    if (!err && reply?.reason === 'rate_limited') return beginChatCooldown(reply);
    showChatNotice(
      err                           ? 'Message not sent — connection timed out. Try again.'
      : reply?.reason === 'invalid' ? `Message must be 1–${reply.maxLength || 1000} characters.`
      :                               'Message not sent. Try again.',
      4000
    );
  });
}

function chatRateTick() {
  const remainingMs = chatRateDeadline - Date.now();
  const notice = document.getElementById('chat-rate-notice');

  if (remainingMs <= 0) {
    clearInterval(chatRateTimer);
    chatRateTimer   = null;
    chatRateBlocked = false;
    const btn = document.getElementById('chat-page-send');
    if (btn) btn.disabled = false;
    if (notice) { notice.hidden = true; notice.textContent = ''; }
    return;
  }

  if (notice) {
    notice.textContent = `Slow down — wait ${Math.ceil(remainingMs / 1000)}s`;
    notice.hidden = false;
  }
}

function restoreChatInput(text) {
  // Put the rejected text back unless the user has already typed something
  // new — never clobber what is in the field.
  const input = document.getElementById('chat-page-input');
  if (input && text && !input.value.trim()) input.value = text;
}

function showChatNotice(text, ms) {
  // Transient notice for invalid / timeout / server-error replies. The
  // countdown owns the element while a cooldown is active, so stay out of it.
  if (chatRateBlocked) return;
  const notice = document.getElementById('chat-rate-notice');
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = false;
  clearTimeout(chatNoticeTimer);
  chatNoticeTimer = setTimeout(() => {
    if (chatRateBlocked) return;        // a cooldown began meanwhile; it will hide it
    notice.hidden = true;
    notice.textContent = '';
  }, ms);
}

function beginChatCooldown(reply) {
  const retryAfterMs = Number(reply?.retryAfterMs) || 0;
  clearTimeout(chatNoticeTimer);        // the countdown takes over the notice

  chatRateBlocked  = true;
  chatRateDeadline = Math.max(chatRateDeadline, Date.now() + retryAfterMs);

  const btn = document.getElementById('chat-page-send');
  if (btn) btn.disabled = true;

  // A burst produces one rejection per message; they all share a single
  // timer, each only pushing the deadline out.
  if (!chatRateTimer) chatRateTimer = setInterval(chatRateTick, 1000);
  chatRateTick();
}
