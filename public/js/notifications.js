/* ═══════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS — the bell panel in the top bar.

   NOT REALTIME: this polls. startNotifPolling() runs loadNotifications() on an
   interval and is started by showApp() / stopped by resetClientState(). It
   uses apiFetchSilent() so the global loading bar does not flash every tick.

   WHERE NOTIFICATIONS COME FROM: the server creates them, never this file.
   Routes call notify() in notifications.js (server) after a contact, deal or
   task changes, and the activity routes create 'mention' rows when someone is
   @-named in a note or comment. Each row carries entity_type + entity_id, and
   onNotifClick() uses those to jump to the deal or contact.

   PREFERENCES are per user (users.notification_prefs), one boolean per
   category (contacts, deals, tasks, objects, activities). The server honours
   them when fanning out, so an unchecked box means the row is never created —
   turning one back on does not backfill what you missed.

   FUNCTION MAP
     poll      startNotifPolling, stopNotifPolling, loadNotifications
     render    renderNotifList, notifIcon, notifTimeAgo
     actions   toggleNotifPanel, onNotifClick, markAllNotifRead, clearReadNotifs
     prefs     loadNotifPrefs, saveNotifPrefs
   ═══════════════════════════════════════════════════════════════════════════ */

let notifPanelOpen = false;
let notifPollTimer = null;

const NOTIF_ICONS = {
  contact_created: '👤',
  deal_created:    '🤝',
  deal_updated:    '✏️',
  deal_stage_changed: '🔄',
  task_created:    '✅',
  system:          '🚀',
  mention:         '@',
  default:         '🔔',
};

function notifIcon(type) { return NOTIF_ICONS[type] || NOTIF_ICONS.default; }

function notifTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return t('ago_now');
  if (m < 60)  return tf('chat_ago_m', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24)  return tf('ago_h', { n: h });
  const d = Math.floor(h / 24);
  return tf('ago_d', { n: d });
}

async function loadNotifications(showLoader = false) {
  try {
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
      ${esc(t('notif_caught_up'))}<br>${esc(t('notif_appear_here'))}
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
        ${n.actor_name ? `<div class="notif-body">${tf('notif_by', { name: esc(n.actor_name) })}</div>` : ''}
        <div class="notif-time">${notifTimeAgo(n.created_at)}</div>
      </div>
    </div>`).join('');
}

async function onNotifClick(id, entityType, entityId) {
  await api.patch(`/api/notifications/${id}/read`);
  if (entityType === 'deal' && entityId) {
    toggleNotifPanel();
    switchPage('deals');
    await openDealModal(entityId);
  } else if ((entityType === 'contact') && entityId) {
    toggleNotifPanel();
    switchPage('contacts');
  }
  loadNotifications();
}

function toggleNotifPanel() {
  notifPanelOpen = !notifPanelOpen;
  document.getElementById('notif-panel')?.classList.toggle('hidden', !notifPanelOpen);
  if (notifPanelOpen) loadNotifications(true);
}

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

function loadNotifPrefs() {
  const prefs = currentUser?.notification_prefs || {};
  document.querySelectorAll('#notif-pref-list input[data-pref]').forEach(cb => {
    const key = cb.dataset.pref;
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
  if (msgEl) { msgEl.textContent = t('msg_saved'); msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}

function startNotifPolling() {
  clearInterval(notifPollTimer);   // a second login in the same tab replaces the poller instead of stacking one
  loadNotifications(false);
  notifPollTimer = setInterval(() => { loadNotifications(false); }, 30000);
}
function stopNotifPolling() { clearInterval(notifPollTimer); }
