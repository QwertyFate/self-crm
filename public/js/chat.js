// ── TEAM CHAT ─────────────────────────────────────────────
let chatPollTimer    = null;
let chatOpen         = false;
let chatOldestId     = null;
let chatNewestId     = null;
let chatLoadingMore  = false;

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
  const myId     = currentUser?.id;
  const prevScroll = el.scrollHeight - el.scrollTop;

  let html = '';
  let lastDate = null;
  let lastUser = null;

  messages.forEach((msg, i) => {
    const isMe    = msg.user_id === myId;
    const msgDate = msg.created_at;

    // Day separator
    if (!lastDate || !isSameDay(lastDate, msgDate)) {
      html += `<div class="chat-day-sep"><span>${dayLabel(msgDate)}</span></div>`;
      lastUser = null;
    }
    lastDate = msgDate;

    // Group consecutive messages from the same user
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
    // Maintain scroll position
    el.scrollTop = el.scrollHeight - prevScroll;
  } else {
    // Remove loading placeholder
    el.querySelector('.chat-loading')?.remove();
    el.innerHTML += html;
  }
}

async function loadChat() {
  chatOpen    = true;
  chatOldestId = null;
  chatNewestId = null;

  const el = document.getElementById('chat-messages');
  el.innerHTML = '<div class="chat-loading">Loading messages…</div>';

  const data = await api.get('/api/chat/messages');
  if (!data || data.error) { el.innerHTML = '<div class="chat-loading">Could not load messages.</div>'; return; }

  el.innerHTML = '';
  if (!data.messages.length) {
    el.innerHTML = '<div class="chat-empty">No messages yet. Say hello to your team!</div>';
  } else {
    renderMessages(data.messages);
    chatOldestId = data.messages[0].id;
    chatNewestId = data.messages[data.messages.length - 1].id;
    scrollChatBottom();
  }

  // Mark as read
  api.patch('/api/chat/read', {});
  updateChatBadge(0);

  // Load older messages on scroll to top
  el.onscroll = () => {
    if (el.scrollTop < 60 && !chatLoadingMore && chatOldestId) loadOlderMessages();
  };

  startChatPolling();

  // Member count
  const members = await api.get('/api/workspace/members');
  if (members && !members.error) {
    document.getElementById('chat-member-count').textContent = `${members.length} member${members.length !== 1 ? 's' : ''}`;
  }
}

async function loadOlderMessages() {
  chatLoadingMore = true;
  const data = await apiFetchSilent(`/api/chat/messages?before=${chatOldestId}`);
  if (data?.messages?.length) {
    renderMessages(data.messages, true);
    chatOldestId = data.messages[0].id;
  }
  chatLoadingMore = false;
}

async function pollNewMessages() {
  if (!chatOpen || !chatNewestId) return;
  const data = await apiFetchSilent('/api/chat/messages');
  if (!data?.messages?.length) return;

  const newMsgs = data.messages.filter(m => m.id > chatNewestId);
  if (!newMsgs.length) return;

  const el       = document.getElementById('chat-messages');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;

  el.querySelector('.chat-empty')?.remove();
  renderMessages(newMsgs);
  chatNewestId = newMsgs[newMsgs.length - 1].id;

  if (atBottom) scrollChatBottom();

  // Mark as read since chat is open
  api.patch('/api/chat/read', {});
  updateChatBadge(0);
}

function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(pollNewMessages, 5000);
}

function stopChatPolling() {
  clearInterval(chatPollTimer);
  chatPollTimer = null;
  chatOpen = false;
}

function scrollChatBottom() {
  const el = document.getElementById('chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

async function sendChatMessage() {
  const input   = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;

  input.value    = '';
  input.disabled = true;

  const res = await api.post('/api/chat/messages', { content });
  input.disabled = false;
  input.focus();

  if (res.error) { input.value = content; return; }

  // Optimistically render own message
  const myMsg = {
    id:         res.id,
    user_id:    currentUser.id,
    user_name:  currentUser.name,
    content,
    created_at: res.created_at || new Date().toISOString(),
  };
  const el = document.getElementById('chat-messages');
  el.querySelector('.chat-empty')?.remove();
  renderMessages([myMsg]);
  chatNewestId = res.id;
  scrollChatBottom();
}

// ── Unread badge (polled silently alongside notifications) ─
function updateChatBadge(count) {
  const badge = document.getElementById('chat-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
}

async function pollChatUnread() {
  if (chatOpen) return; // no badge needed when chat is open
  const data = await apiFetchSilent('/api/chat/unread');
  if (data && !data.error) updateChatBadge(data.unread);
}
