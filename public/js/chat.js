// ── TEAM CHAT ─────────────────────────────────────────────
let chatOpen         = false;
let chatPageOpen     = false;
let chatOldestId     = null;
let chatNewestId     = null;
let chatLoadingMore  = false;
let socket           = null;
let onlineUsers      = [];

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


// ── Unread badge (polled silently alongside notifications) ─
function updateChatBadge(count) {
  const badge = document.getElementById('chat-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
}


// ── Socket.io connection ──────────────────────────────────
function initChatSocket() {
  console.log('initChatSocket called');
  if (socket) {
    console.log('Socket already initialized');
    return;
  }

  console.log('Creating new socket.io connection...');
  socket = io();
  console.log('Socket created:', socket);

  socket.on('connect', () => {
    console.log('Chat socket connected with id:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('Chat socket connection error:', error);
  });

  socket.on('online_users', (users) => {
    onlineUsers = users;
    renderPageOnlineUsers();
  });

  socket.on('new_message', (msg) => {
    console.log('Received message:', msg);

    // Update page chat
    const pageEl = document.getElementById('chat-page-messages');
    if (pageEl && chatPageOpen) {
      pageEl.querySelector('.chat-empty')?.remove();
      renderMessagesToPage([msg]);

      if (!chatNewestId || msg.id > chatNewestId) {
        chatNewestId = msg.id;
      }

      // Always scroll to bottom for new messages
      setTimeout(() => scrollChatPageBottom(), 50);

      api.patch('/api/chat/read', {});
      updateChatBadge(0);
    }

    // Update badge if chat not open
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
  // Team chat is coming soon - just return
  return;
}

async function _loadChatPageDisabled() {
  console.log('loadChatPage called');
  chatPageOpen = true;
  chatOldestId = null;
  chatNewestId = null;

  if (!socket) {
    console.log('Socket not initialized, initializing...');
    initChatSocket();
  }

  const el = document.getElementById('chat-page-messages');
  if (!el) {
    console.error('chat-page-messages element not found');
    return;
  }

  try {
    console.log('Fetching chat messages...');
    const data = await api.get('/api/chat/messages');
    console.log('Chat messages response:', data);

    if (!data || data.error) {
      console.error('Chat messages error:', data?.error);
      el.innerHTML = '<div class="chat-empty">Could not load messages.</div>';
      return;
    }

    if (!data.messages || !data.messages.length) {
      console.log('No messages found');
      el.innerHTML = '<div class="chat-empty">No messages yet. Say hello to your team!</div>';
    } else {
      console.log('Rendering', data.messages.length, 'messages');
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
    console.log('loadChatPage completed');
  } catch (err) {
    console.error('Error in loadChatPage:', err);
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

  // When appending new messages, check the last rendered date
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

    // Only add day separator if it's a new day
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
    // Loading older messages - insert silently
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    el.insertBefore(tempDiv, el.firstChild);
    el.scrollTop = el.scrollHeight - prevScroll;
  } else {
    // Initial load or new messages
    el.innerHTML += html;
  }
}

function scrollChatPageBottom() {
  const el = document.getElementById('chat-page-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function sendChatMessageFromPage() {
  const input = document.getElementById('chat-page-input');
  const content = input.value.trim();
  if (!content) return;

  if (!socket?.connected) {
    console.error('Socket not connected');
    return;
  }

  console.log('Sending message:', content);
  input.value = '';
  socket.emit('chat_message', content);
}
