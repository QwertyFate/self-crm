/* ── Activities: the workspace log ──────────────────────────────────────────
   Every note, call, email and WhatsApp message logged in the workspace,
   newest first, grouped by day under headings that stick while you scroll.
   Search and a type filter narrow the list; each row reaches its contact,
   renders the note as rich text, and carries edit and delete.             */
let activityFilter = { type: 'all', q: '' };
const ACT_PREVIEW_LINES = 4;

/* ── Pure helpers ────────────────────────────────────────────────────────── */

// Type filter, then a case-insensitive search over the note's text (tags stripped), the contact and the author.
function activityMatches(a, filter) {
  if (filter?.type && filter.type !== 'all' && a.type !== filter.type) return false;
  const q = String(filter?.q || '').trim().toLowerCase();
  if (!q) return true;
  const text = String(a.content || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  return [text, a.contact_name, a.logged_by_name].some(s => String(s || '').toLowerCase().includes(q));
}
function activityTime(iso) {
  const locale = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'en-GB';
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
// Keeps the list's order; one group per local day, labelled Today / Yesterday / the date.
function groupActivitiesByDay(list, now = new Date()) {
  const groups = [];
  let last = null;
  for (const a of list) {
    const d = new Date(a.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!last || last.key !== key) { last = { key, label: dayLabelFor(a.created_at, now), items: [] }; groups.push(last); }
    last.items.push(a);
  }
  return groups.map(({ label, items }) => ({ label, items }));
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

function activityItemHtml(a) {
  const icons = { note: UI_ICON.note, call: UI_ICON.call, email: UI_ICON.mail, whatsapp: WA_SVG };
  const fold = _countNoteLines(a.content) > ACT_PREVIEW_LINES;
  const contact = a.contact_id && a.contact_name
    ? `<span class="act-sep" aria-hidden="true">·</span><button type="button" class="act-contact" onclick="openActivityContact(${Number(a.contact_id)})">${esc(a.contact_name)}</button>`
    : '';
  return `
    <div class="activity-item" data-activity-id="${a.id}">
      <div class="act-icon ${esc(a.type)}" aria-hidden="true">${icons[a.type] || UI_ICON.note}</div>
      <div class="act-main">
        <div class="act-head">
          <span class="act-type">${t('act_' + a.type)}</span>${contact}
          <span class="act-meta">${a.logged_by_name ? `<span>${esc(a.logged_by_name)}</span>` : ''}<time datetime="${esc(a.created_at)}">${esc(activityTime(a.created_at))}</time></span>
        </div>
        <div class="act-content${fold ? ' collapsed' : ''}">${sanitizeNoteHtml(a.content)}</div>
        ${fold ? `<button type="button" class="deal-note-expand-btn" onclick="toggleActivityExpand(this)">${t('show_more')}</button>` : ''}
      </div>
      <div class="act-actions">
        <button type="button" class="btn btn-sm btn-ghost btn-icon" title="${esc(t('act_edit'))}" aria-label="${esc(t('act_edit'))}" onclick="editActivity(${a.id})">${UI_ICON.edit}</button>
        <button type="button" class="btn btn-sm btn-ghost btn-icon act-delete" title="${esc(t('act_delete'))}" aria-label="${esc(t('act_delete'))}" onclick="deleteActivity(${a.id})">${UI_ICON.remove}</button>
      </div>
    </div>`;
}

function renderActivities() {
  const el = document.getElementById('activities-list'); if (!el) return;
  const all = Array.isArray(activities) ? activities : [];
  const summary = document.getElementById('activities-summary');
  if (summary) summary.textContent = t('n_activities').replace('{n}', all.length);
  document.querySelectorAll('#activities-type-toggle .view-toggle-btn').forEach(b => {
    const on = b.dataset.type === activityFilter.type;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
  });
  if (!all.length) {
    el.innerHTML = `<div class="table-empty-state act-empty"><h2>${t('no_activities_title')}</h2><p>${t('no_activities_hint')}</p><button type="button" class="btn btn-primary btn-sm" onclick="openActivityModal()">${UI_ICON.plus}<span>${t('log_activity')}</span></button></div>`;
    return;
  }
  const list = all.filter(a => activityMatches(a, activityFilter));
  if (!list.length) { el.innerHTML = `<div class="table-empty-state act-empty"><p>${t('no_activities_match')}</p></div>`; return; }
  el.innerHTML = groupActivitiesByDay(list).map(g =>
    `<div class="act-day">${esc(g.label)}</div><div class="act-group">${g.items.map(activityItemHtml).join('')}</div>`
  ).join('');
}

/* ── Interaction ─────────────────────────────────────────────────────────── */

function setActivityType(type) { activityFilter.type = type; renderActivities(); }
function setActivityQuery(q) { activityFilter.q = q; renderActivities(); }
function toggleActivityExpand(btn) {
  const content = btn.closest('.act-main')?.querySelector('.act-content'); if (!content) return;
  const collapsed = content.classList.toggle('collapsed');
  btn.textContent = collapsed ? t('show_more') : t('show_less');
}
// The contact side panel lives on the Contacts page, so go there first.
async function openActivityContact(contactId) {
  await switchPage('contacts');
  openDetail(contactId);
}

/* ── Data ────────────────────────────────────────────────────────────────── */

async function loadActivities() {
  const data = await api.get('/api/activities');
  activities = Array.isArray(data) ? data : [];
  renderActivities();
}
async function deleteActivity(id) {
  if (!confirm(t('confirm_delete_activity'))) return;
  await api.del(`/api/activities/${id}`);
  loadActivities();
}
