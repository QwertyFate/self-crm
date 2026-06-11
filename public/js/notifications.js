// ── NOTIFICATIONS ──────────────────────────────────────────
let notifPanelOpen = false;
let notifPollTimer = null;

const NOTIF_ICONS = {
  contact_created: '👤',
  deal_created:    '🤝',
  deal_updated:    '✏️',
  deal_stage_changed: '🔄',
  task_created:    '✅',
  system:          '🚀',
  default:         '🔔',
};

function notifIcon(type) { return NOTIF_ICONS[type] || NOTIF_ICONS.default; }

function notifTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

async function loadNotifications(showLoader = false) {
  try {
    // Use silent fetch for background polls — no loading bar or overlay
    const res = showLoader
      ? await api.get('/api/notifications')
      : await apiFetchSilent('/api/notifications');
    if (!res || res.error) return;
    const { notifications, unread } = res;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.classList.toggle('hidden', unread === 0);
    }
    if (notifPanelOpen) renderNotifList(notifications);
  } catch { /* silent */ }
}

function renderNotifList(notifications) {
  const el = document.getElementById('notif-list');
  if (!el) return;
  if (!notifications.length) {
    el.innerHTML = `<div class="notif-empty">
      <div style="font-size:32px;margin-bottom:8px">🔔</div>
      You're all caught up!<br>Notifications will appear here.
    </div>`;
    return;
  }
  el.innerHTML = notifications.map(n => `
    <div class="notif-item${n.read ? '' : ' unread'}${n.type === 'system' ? ' notif-system' : ''}"
      onclick="onNotifClick(${n.id}, '${n.entity_type || ''}', ${n.entity_id || 'null'})">
      <span class="notif-dot${n.read ? ' read' : ''}"></span>
      <span class="notif-icon">${notifIcon(n.type)}</span>
      <div class="notif-content">
        <div class="notif-title">${esc(n.title)}</div>
        ${n.body ? `<div class="notif-body">${esc(n.body)}</div>` : ''}
        ${n.actor_name ? `<div class="notif-body">By ${esc(n.actor_name)}</div>` : ''}
        <div class="notif-time">${notifTimeAgo(n.created_at)}</div>
      </div>
    </div>`).join('');
}

async function onNotifClick(id, entityType, entityId) {
  // Mark as read
  await api.patch(`/api/notifications/${id}/read`);
  // Navigate to the entity if applicable
  if (entityType === 'deal' && entityId) {
    toggleNotifPanel();
    switchPage('deals');
    await openDealModal(entityId);
  } else if ((entityType === 'contact') && entityId) {
    toggleNotifPanel();
    switchPage('contacts');
  }
  // Refresh list
  loadNotifications();
}

function toggleNotifPanel() {
  notifPanelOpen = !notifPanelOpen;
  document.getElementById('notif-panel')?.classList.toggle('hidden', !notifPanelOpen);
  // Show loader when user deliberately opens the panel, not on background polls
  if (notifPanelOpen) loadNotifications(true);
}

// Close panel when clicking outside
document.addEventListener('mousedown', e => {
  if (!notifPanelOpen) return;
  if (!e.target.closest('#notif-panel') && !e.target.closest('#notif-bell-btn')) {
    notifPanelOpen = false;
    document.getElementById('notif-panel')?.classList.add('hidden');
  }
});

async function markAllNotifRead() {
  await api.patch('/api/notifications/read-all');
  loadNotifications();
}

async function clearReadNotifs() {
  await api.del('/api/notifications/clear');
  loadNotifications();
}

// ── Notification preferences ──────────────────────────────
function loadNotifPrefs() {
  const prefs = currentUser?.notification_prefs || {};
  document.querySelectorAll('#notif-pref-list input[data-pref]').forEach(cb => {
    const key = cb.dataset.pref;
    // Default to true if not set
    cb.checked = prefs[key] !== false;
  });
}

async function saveNotifPrefs() {
  const prefs = {};
  document.querySelectorAll('#notif-pref-list input[data-pref]').forEach(cb => {
    prefs[cb.dataset.pref] = cb.checked;
  });
  const msgEl = document.getElementById('notif-pref-msg');
  const res = await api.patch('/api/notifications/preferences', { prefs });
  if (res.error) {
    if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); }
    return;
  }
  if (currentUser) currentUser.notification_prefs = prefs;
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}

// ── Polling — check every 30 seconds ─────────────────────
function startNotifPolling() {
  loadNotifications(false);
  notifPollTimer = setInterval(() => { loadNotifications(false); }, 30000);
}
function stopNotifPolling() { clearInterval(notifPollTimer); }
