/* ═══════════════════════════════════════════════════════════════════════════
   INTEGRATIONS — two independent halves on one page, switched by switchIntgTab().

   1. INBOUND WEBHOOK ("webhook" tab) — getting leads INTO the CRM.
      Every workspace has one webhook URL ending in a secret key. An external
      form posts JSON to it; a field_map says which incoming key becomes which
      CRM field, and dot paths ("data.contact.email") are supported. Optionally
      each lead also creates a deal in a chosen pipeline and stage.
        loadIntegrations → GET /api/integrations/settings (creates the row and
        the key on first view) → renderIntgFieldMap + renderIntgStageOptions
        saveIntegration  → PATCH /api/integrations/settings
        loadIntgLogs     → GET /api/integrations/logs (last 50 deliveries, with
                           what was captured and what was skipped)
      renderIntgPlatforms / showIntgGuide / buildGuideJson produce the
      copy-paste setup snippet per external platform.

   2. OUTBOUND ENGINE ("engine" tab) — pushing events OUT of the CRM.
      When a deal moves into one of the configured trigger stages, the server
      POSTs a signed vertrag.unterschrieben event to the Engine URL
      (utils/engine.js). This tab edits those settings and shows the delivery log.
        loadEngineSettings    → GET  /api/engine/settings
        saveEngineSettings    → PATCH /api/engine/settings
        regenerateEngineSecret→ POST /api/engine/settings/regenerate-secret
        sendEngineTestEvent   → POST /api/engine/test-event
        loadEngineDeliveries  → GET  /api/engine/deliveries
      READ-ONLY FOR MEMBERS: the server returns can_manage:false and omits the
      secret for non owner/admin; setEngineReadOnly() disables the inputs to
      match. The disabling is cosmetic — the server is the real gate.

   FUNCTION MAP
     shell     switchIntgTab, loadIntegrations
     inbound   intgPlatformName, renderIntgPlatforms, showIntgGuide, buildGuideJson,
               refreshGuideJson, renderIntgFieldMap, renderFieldRow,
               intgToggleKeyEdit, intgKeyBlur, intgAddField, intgRemoveField,
               getIntgFieldMap, renderIntgStageOptions, loadIntgStages,
               toggleIntgDeal, saveIntegration, copyWebhookUrl,
               regenerateWebhookKey, loadIntgLogs
     engine    loadEngineSettings, saveEngineSettings, setEngineReadOnly,
               renderEngineStages, getEngineTriggerIds, maskSecret,
               copyEngineSecret, regenerateEngineSecret, sendEngineTestEvent,
               loadEngineDeliveries, engineDeliveryHtml, showEngineMsg
     clipboard copyIntgText, copyIntgJson, fallbackCopy
   ═══════════════════════════════════════════════════════════════════════════ */

let intgData = null;
let currentIntgTab = 'webhook';   // remembered for the session, like the Settings rail

// The page reuses the Settings rail markup. Scoped to this page so the two rails
// (same class names) never toggle each other.
function switchIntgTab(tab) {
  currentIntgTab = tab;
  const root = document.getElementById('page-integrations');
  if (!root) return;
  root.querySelectorAll('.settings-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  root.querySelectorAll('.settings-pane').forEach(pane => pane.classList.toggle('active', pane.id === `intg-pane-${tab}`));
}

const INTG_BUILTIN_FIELDS = [
  { key: 'name',    labelKey: 'lbl_name',    placeholder: 'full_name'     },
  { key: 'email',   labelKey: 'lbl_email',   placeholder: 'email'         },
  { key: 'phone',   labelKey: 'lbl_phone',   placeholder: 'phone_number'  },
  { key: 'company', labelKey: 'lbl_company', placeholder: 'company'       },
];

// steps / jsonNote / jsonLabel (and the optional nameKey) are dictionary keys (intg_*),
// resolved with t() in showIntgGuide / intgPlatformName so a language switch re-renders
// the open guide. The strings carry <strong>/<code> markup; literal names of Make /
// Zapier / n8n options (e.g. "HTTP → Make a request", "No authentication") stay English
// in both languages because the user has to find them in those products' UI.
const INTG_PLATFORMS = [
  {
    id: 'make',
    name: 'Make.com',
    color: '#6c4de6',
    logo: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="make-g" x1="0" y1="1" x2="0.6" y2="0">
          <stop offset="0%" stop-color="#e040fb"/>
          <stop offset="100%" stop-color="#6c3fe4"/>
        </linearGradient>
      </defs>
      <rect x="1"  y="6"  width="9" height="28" rx="4.5" transform="rotate(-15 5.5 20)"  fill="url(#make-g)"/>
      <rect x="14" y="4"  width="9" height="32" rx="4.5" transform="rotate(-15 18.5 20)" fill="url(#make-g)"/>
      <rect x="27" y="2"  width="9" height="36" rx="4.5" transform="rotate(-15 31.5 20)" fill="url(#make-g)"/>
    </svg>`,
    steps: ['intg_make_step1', 'intg_make_step2', 'intg_step_paste_url', 'intg_make_step4', 'intg_make_step5', 'intg_make_step6', 'intg_make_step7'],
    jsonNote:  'intg_make_note',
    jsonLabel: 'intg_make_json_label',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    color: '#FF4A00',
    logo: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="20" fill="#FF4A00"/>
      <g transform="translate(20,20)" fill="white">
        <rect x="-3" y="-11" width="6" height="22" rx="3"/>
        <rect x="-3" y="-11" width="6" height="22" rx="3" transform="rotate(60)"/>
        <rect x="-3" y="-11" width="6" height="22" rx="3" transform="rotate(120)"/>
        <circle cx="0" cy="0" r="4.5" fill="#FF4A00"/>
        <circle cx="0" cy="0" r="2.5" fill="white"/>
      </g>
    </svg>`,
    steps: ['intg_zapier_step1', 'intg_zapier_step2', 'intg_zapier_step3', 'intg_zapier_step4', 'intg_zapier_step5'],
    jsonNote:  'intg_zapier_note',
    jsonLabel: 'intg_zapier_json_label',
  },
  {
    id: 'n8n',
    name: 'n8n',
    color: '#EA4B71',
    logo: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#EA4B71"/>
      <!-- left node -->
      <circle cx="9"  cy="20" r="4"   fill="white"/>
      <!-- middle-top node -->
      <circle cx="20" cy="12" r="4"   fill="white"/>
      <!-- middle-bottom node -->
      <circle cx="20" cy="28" r="4"   fill="white"/>
      <!-- right-top node (ring) -->
      <circle cx="31" cy="8"  r="3.5" fill="none" stroke="white" stroke-width="2.5"/>
      <!-- right-bottom node (ring) -->
      <circle cx="31" cy="32" r="3.5" fill="none" stroke="white" stroke-width="2.5"/>
      <!-- connector lines -->
      <line x1="13" y1="18" x2="16" y2="14" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="13" y1="22" x2="16" y2="26" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="24" y1="11" x2="27" y2="9"  stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="24" y1="29" x2="27" y2="31" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
    steps: ['intg_n8n_step1', 'intg_n8n_step2', 'intg_step_paste_url', 'intg_n8n_step4', 'intg_n8n_step5', 'intg_n8n_step6', 'intg_n8n_step7'],
    jsonNote:  'intg_n8n_note',
    jsonLabel: 'intg_n8n_json_label',
  },
  {
    id: 'custom',
    name: 'Custom / API',
    nameKey: 'intg_platform_custom',   // the only non-product name: shown through t()
    color: '#64748b',
    logo: `<svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    steps: ['intg_custom_step1', 'intg_custom_step2', 'intg_custom_step3', 'intg_custom_step4', 'intg_custom_step5'],
    jsonNote:  'intg_custom_note',
    jsonLabel: 'intg_custom_json_label',
  },
];

let activeGuideId = null;

// Product names (Make.com, Zapier, n8n) are shown as they are; a platform with a
// nameKey (the custom/API entry) is shown in the UI language.
function intgPlatformName(p) { return p.nameKey ? t(p.nameKey) : p.name; }

function renderIntgPlatforms() {
  const list = document.getElementById('intg-platform-list');
  if (!list) return;
  list.innerHTML = INTG_PLATFORMS.map(p => `
    <button class="intg-platform-card${activeGuideId === p.id ? ' active' : ''}"
      onclick="showIntgGuide('${p.id}')" data-platform="${p.id}">
      <div class="intg-platform-logo">${p.logo}</div>
      <div class="intg-platform-name">${esc(intgPlatformName(p))}</div>
    </button>`).join('');
}

const INTG_SAMPLE_VALUES = {
  name: 'Jane Doe', full_name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe',
  email: 'jane@example.com', phone: '+49123456789', phone_number: '+49123456789',
  company: 'Acme GmbH', city: 'Berlin', country: 'Germany', address: '123 Main St',
  website: 'https://acme.com', source: 'facebook', campaign: 'summer_2026',
};

function buildGuideJson(platformId) {
  const mapping = {};
  document.querySelectorAll('#intg-field-map .intg-map-input').forEach(inp => {
    if (inp.value.trim()) mapping[inp.dataset.crm] = inp.value.trim();
  });

  if (!Object.keys(mapping).length) {
    return platformId === 'n8n'
      ? '{\n  "full_name": "{{ $json.full_name }}",\n  "email": "{{ $json.email }}",\n  "phone_number": "{{ $json.phone_number }}"\n}'
      : platformId === 'make'
        ? '{\n  "full_name": "{{1.full_name}}",\n  "email": "{{1.email}}",\n  "phone_number": "{{1.phone_number}}"\n}'
        : '{\n  "full_name": "Jane Doe",\n  "email": "jane@example.com",\n  "phone_number": "+49123456789"\n}';
  }

  const lines = Object.entries(mapping).map(([crmKey, incomingKey]) => {
    let val;
    if (platformId === 'make') {
      val = `"{{1.${incomingKey}}}"`;
    } else if (platformId === 'n8n') {
      val = `"{{ $json.${incomingKey} }}"`;
    } else {
      const sample = INTG_SAMPLE_VALUES[incomingKey] || INTG_SAMPLE_VALUES[crmKey] || t('intg_example_value');
      val = JSON.stringify(sample);
    }
    return `  "${incomingKey}": ${val}`;
  });

  return '{\n' + lines.join(',\n') + '\n}';
}

function showIntgGuide(id) {
  activeGuideId = id;
  const platform = INTG_PLATFORMS.find(p => p.id === id);
  if (!platform) return;

  document.querySelectorAll('.intg-platform-card').forEach(c =>
    c.classList.toggle('active', c.dataset.platform === id)
  );

  const json      = buildGuideJson(id);
  const steps     = platform.steps.map(k => `<li>${t(k)}</li>`).join('');   // dictionary strings with markup — inserted as-is
  const noteHtml  = platform.jsonNote
    ? `<div class="intg-json-note">${t(platform.jsonNote)}</div>`
    : '';

  const webhookUrl = document.getElementById('intg-url').value;
  document.getElementById('intg-guide-panel').innerHTML = `
    <div class="intg-guide-header">
      <div class="intg-guide-logo-sm">${platform.logo}</div>
      <div>
        <div class="intg-guide-title-text">${esc(intgPlatformName(platform))}</div>
        <div class="intg-guide-subtitle">${esc(t('intg_setup_guide'))}</div>
      </div>
    </div>
    <div class="intg-guide-url">
      <div class="intg-guide-url-label">${esc(t('intg_guide_url'))}</div>
      <div class="intg-guide-url-row">
        <code>${esc(webhookUrl)}</code>
        <button class="btn btn-sm" onclick="copyIntgText(this, this.previousElementSibling.textContent)">${esc(t('btn_copy'))}</button>
      </div>
    </div>
    <ol class="intg-guide-steps">${steps}</ol>
    ${noteHtml}
    <div class="intg-json-block">
      <div class="intg-json-header">
        <span>${esc(t(platform.jsonLabel))}</span>
        <button class="btn btn-sm intg-copy-btn" onclick="copyIntgJson(this)">${esc(t('btn_copy'))}</button>
      </div>
      <pre class="intg-code">${json}</pre>
    </div>`;
}

// The Engine card loads on its own and the remembered rail tab is re-applied first, so neither is
// blocked by the lead-webhook early return below.
async function loadIntegrations() {
  loadEngineSettings();
  switchIntgTab(currentIntgTab);
  const intgFieldMap = document.getElementById('intg-field-map');
  if (intgFieldMap) intgFieldMap.innerHTML = '';

  await ensureMembers();
  const data = await api.get('/api/integrations/settings');
  if (!data || data.error) return;
  intgData = data;

  const { webhook, pipelines } = data;
  const origin = data.base_url || window.location.origin;

  document.getElementById('intg-url').value =
    `${origin}/api/integrations/receive/${webhook.webhook_key}`;
  document.getElementById('intg-active').checked = webhook.active;

  activeCustomKeys = [];
  renderIntgFieldMap(webhook.field_map || {});

  document.getElementById('intg-create-deal').checked = webhook.create_deal;
  document.getElementById('intg-deal-options').classList.toggle('hidden', !webhook.create_deal);

  const pipelineEl = document.getElementById('intg-pipeline');
  pipelineEl.innerHTML = pipelines.map(p =>
    `<option value="${p.id}" ${webhook.pipeline_id == p.id ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');

  renderIntgStageOptions(webhook.stage_id);

  const assigneeEl = document.getElementById('intg-assignee');
  assigneeEl.innerHTML = `<option value="">${esc(t('opt_assignee_self'))}</option>` +
    members.map(m =>
      `<option value="${m.id}" ${webhook.default_assignee_id == m.id ? 'selected' : ''}>${esc(m.name)}</option>`
    ).join('');

  renderIntgPlatforms();
  showIntgGuide(activeGuideId || 'make');   // re-render the open guide too (language switch re-runs this loader)
  loadIntgLogs();
}

let activeCustomKeys = [];

function renderIntgFieldMap(fieldMap) {
  const el           = document.getElementById('intg-field-map');
  const customFields = intgData?.contact_fields || [];

  const savedCustomKeys = Object.keys(fieldMap).filter(k =>
    !INTG_BUILTIN_FIELDS.some(b => b.key === k) && customFields.some(f => f.field_key === k)
  );
  activeCustomKeys = [...new Set([...savedCustomKeys, ...activeCustomKeys])];

  el.innerHTML = `
    <div class="intg-map-section-label">${esc(t('intg_builtin_fields'))}</div>
    ${INTG_BUILTIN_FIELDS.map(f => renderFieldRow(f.key, t(f.labelKey), f.placeholder, fieldMap[f.key] || '', false)).join('')}

    ${activeCustomKeys.length ? `<div class="intg-map-section-label">${esc(t('intg_custom_fields'))}</div>` : ''}
    ${activeCustomKeys.map(key => {
      const cf = customFields.find(f => f.field_key === key);
      if (!cf) return '';
      return renderFieldRow(key, cf.name, key, fieldMap[key] || '', true);
    }).join('')}

    <div class="intg-map-add-row">
      <select id="intg-add-field-select" class="form-control intg-add-select">
        <option value="">${esc(t('intg_add_field_ph'))}</option>
        ${customFields
          .filter(f => !activeCustomKeys.includes(f.field_key))
          .map(f => `<option value="${f.field_key}">${esc(f.name)}</option>`)
          .join('')}
      </select>
      <button class="btn btn-sm" onclick="intgAddField()">${UI_ICON.plus}<span>${esc(t('add_btn'))}</span></button>
    </div>`;
}

function renderFieldRow(key, label, placeholder, value, isCustom) {
  const displayVal = value || placeholder;
  const removeBtn  = isCustom
    ? `<span class="intg-map-end"><span class="intg-map-custom-tag">${esc(t('intg_custom_tag'))}</span><button class="intg-map-remove" onclick="intgRemoveField('${key}')" title="${esc(t('btn_delete'))}" aria-label="${esc(t('btn_delete'))}">${UI_ICON.remove}</button></span>`
    : '<span></span>';
  return `
    <div class="intg-map-row">
      <div class="intg-map-crm"><span class="intg-map-label" title="${esc(label)}">${esc(label)}</span></div>
      <span class="intg-map-arrow">←</span>
      <div class="intg-key-field">
        <input class="intg-map-input intg-key-input" type="text"
          data-crm="${key}"
          value="${esc(displayVal)}"
          readonly
          onblur="intgKeyBlur(this)"
          oninput="refreshGuideJson()" />
        <button class="btn btn-sm btn-icon intg-key-edit-btn" onclick="intgToggleKeyEdit(this)" title="${esc(t('intg_edit_key'))}" aria-label="${esc(t('intg_edit_key'))}">${UI_ICON.edit}</button>
      </div>
      ${removeBtn}
    </div>`;
}

function intgToggleKeyEdit(btn) {
  const input = btn.closest('.intg-key-field').querySelector('.intg-key-input');
  const isReadOnly = input.hasAttribute('readonly');
  if (isReadOnly) {
    input.removeAttribute('readonly');
    input.focus();
    input.select();
    btn.classList.add('active');
  } else {
    input.setAttribute('readonly', '');
    btn.classList.remove('active');
    refreshGuideJson();
  }
}

function intgKeyBlur(input) {
  if (!input.value.trim()) {
    const crmKey  = input.dataset.crm;
    const builtin = INTG_BUILTIN_FIELDS.find(f => f.key === crmKey);
    const cf      = intgData?.contact_fields?.find(f => f.field_key === crmKey);
    input.value   = builtin?.placeholder || cf?.field_key || crmKey;
  }
  input.setAttribute('readonly', '');
  const btn = input.closest('.intg-key-field')?.querySelector('.intg-key-edit-btn');
  if (btn) btn.classList.remove('active');
  refreshGuideJson();
}

async function intgAddField() {
  const sel = document.getElementById('intg-add-field-select');
  const key = sel?.value;
  if (!key) return;
  if (!activeCustomKeys.includes(key)) activeCustomKeys.push(key);
  const current = getIntgFieldMap();
  renderIntgFieldMap(current);
  refreshGuideJson();
  await saveIntegration(true);
}

async function intgRemoveField(key) {
  activeCustomKeys = activeCustomKeys.filter(k => k !== key);
  const current = getIntgFieldMap();
  delete current[key];
  renderIntgFieldMap(current);
  refreshGuideJson();
  await saveIntegration(true);
}

function getIntgFieldMap() {
  const map = {};
  document.querySelectorAll('#intg-field-map .intg-key-input').forEach(inp => {
    if (inp.value.trim()) map[inp.dataset.crm] = inp.value.trim();
  });
  return map;
}

function refreshGuideJson() {
  if (activeGuideId) showIntgGuide(activeGuideId);
}

// Stage choices for the auto-deal block. While "Create a deal for every incoming
// lead" is on there is no "no stage" choice: a stage is required, so the first one
// of the selected pipeline is preselected.
function renderIntgStageOptions(selectedStageId) {
  const stageEl = document.getElementById('intg-stage');
  if (!stageEl || !intgData) return;

  const dealOn     = document.getElementById('intg-create-deal').checked;
  const pipelineId = parseInt(document.getElementById('intg-pipeline').value);
  const pipeline   = (intgData?.pipelines || []).find(p => p.id === pipelineId);
  const stages     = (intgData?.stages || []).filter(s => !pipeline || s.pipeline_name === pipeline.name);

  if (!dealOn) {
    stageEl.innerHTML = `<option value="">${esc(t('opt_no_deal_stage'))}</option>` +
      stages.map(s => `<option value="${s.id}"${selectedStageId == s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    return;
  }

  if (!stages.length) {
    // Only reachable for a pipeline without stages: nothing to pick, so say so
    // instead of silently offering a deal without a stage.
    stageEl.innerHTML = `<option value="" disabled selected>${esc(t('intg_no_stages_in_pipeline'))}</option>`;
    return;
  }

  stageEl.innerHTML = stages.map(s =>
    `<option value="${s.id}"${selectedStageId == s.id ? ' selected' : ''}>${esc(s.name)}</option>`
  ).join('');

  if (!stageEl.value) stageEl.value = String(stages[0].id);   // a stage is required
}

function loadIntgStages() {
  if (!intgData) return;
  renderIntgStageOptions(null);
}

function toggleIntgDeal() {
  const on = document.getElementById('intg-create-deal').checked;
  document.getElementById('intg-deal-options').classList.toggle('hidden', !on);
  renderIntgStageOptions(document.getElementById('intg-stage').value);
}

async function saveIntegration(silent = false) {
  const fieldMap = getIntgFieldMap();

  const res = await api.patch('/api/integrations/settings', {
    field_map:   fieldMap,
    create_deal: document.getElementById('intg-create-deal').checked,
    pipeline_id: document.getElementById('intg-pipeline').value  || null,
    stage_id:    document.getElementById('intg-stage').value     || null,
    default_assignee_id: document.getElementById('intg-assignee').value || null,
    active:      document.getElementById('intg-active').checked,
  });

  if (silent) {
    const el = document.getElementById('intg-field-map');
    if (el) {
      const tip = document.createElement('div');
      tip.className = 'intg-autosaved';
      tip.textContent = t('intg_autosaved');
      el.parentNode.insertBefore(tip, el.nextSibling);
      setTimeout(() => tip.remove(), 2000);
    }
    return;
  }
  const msgEl = document.getElementById('intg-msg');
  if (res.error) {
    msgEl.textContent = res.error;
    msgEl.className   = 'workspace-name-msg error';
  } else {
    msgEl.textContent = t('msg_saved');
    msgEl.className   = 'workspace-name-msg success';
  }
  msgEl.classList.remove('hidden');
  setTimeout(() => msgEl.classList.add('hidden'), 2500);
}

function copyWebhookUrl() {
  const url = document.getElementById('intg-url').value;
  navigator.clipboard.writeText(url).then(() => {
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = t('copied');
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

async function regenerateWebhookKey() {
  if (!confirm(t('intg_confirm_regen_url'))) return;
  const res = await api.post('/api/integrations/settings/regenerate-key', {});
  if (res.error) { alert(res.error); return; }
  const origin = intgData?.base_url || window.location.origin;
  document.getElementById('intg-url').value = `${origin}/api/integrations/receive/${res.webhook_key}`;
  if (intgData?.webhook) intgData.webhook.webhook_key = res.webhook_key;
}

async function loadIntgLogs() {
  const data = await api.get('/api/integrations/logs');
  const el   = document.getElementById('intg-logs');
  if (!data || data.error || !data.logs.length) {
    el.innerHTML = `<p class="empty-inline">${esc(t('intg_no_activity'))}</p>`;
    return;
  }
  el.innerHTML = data.logs.map(l => {
    const skipped  = l.captured?._skipped || {};
    const hasSkips = Object.keys(skipped).length > 0;
    const captured = { ...l.captured };
    delete captured._skipped;

    return `<div class="intg-log-entry${l.status === 'error' ? ' error' : ''}">
      <div class="intg-log-entry-header">
        <span class="intg-log-badge ${l.status}">${esc(t('intg_log_' + l.status))}</span>
        <span class="intg-log-time">${new Date(l.created_at).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-GB')}</span>
        <span class="intg-log-contact">${l.contact_name ? esc(l.contact_name) : (l.error ? esc(l.error) : '—')}</span>
      </div>
      ${l.status === 'success' ? `
        <div class="intg-log-fields">
          ${Object.entries(captured).filter(([,v]) => v).map(([k, v]) =>
            `<span class="intg-log-field"><span class="intg-log-field-key">${esc(k)}</span>${esc(String(v))}</span>`
          ).join('')}
        </div>
        ${hasSkips ? `<div class="intg-log-skipped">
          ${esc(t('intg_fields_missing'))} ${Object.keys(skipped).map(k => `<code>${esc(k)}</code>`).join(', ')}
          ${esc(t('intg_fields_missing_hint'))}
        </div>` : ''}` : ''}
      <div class="intg-log-raw-toggle" onclick="this.nextElementSibling.classList.toggle('hidden')">${esc(t('intg_view_raw'))}</div>
      <pre class="intg-log-raw hidden">${esc(JSON.stringify(l.payload || {}, null, 2))}</pre>
    </div>`;
  }).join('');
}

// Copies `text` and flashes the button label; used by the guide URL and the sample payload.
function copyIntgText(btn, text) {
  const done = () => { const o = btn.textContent; btn.textContent = t('copied'); setTimeout(() => btn.textContent = o, 1500); };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function copyIntgJson(btn) {
  const pre = btn.closest('.intg-json-block').querySelector('pre');
  copyIntgText(btn, pre.textContent.trim());
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); cb(); } catch(e) {}
  document.body.removeChild(ta);
}

// ── Upgrads Engine card (outgoing vertrag.unterschrieben webhook) ──────────────
let engineData = null;

async function loadEngineSettings() {
  const data = await api.get('/api/engine/settings');
  if (!data || data.error || !data.engine) return;
  engineData = data;
  const e = data.engine;
  const urlEl    = document.getElementById('engine-url');    if (urlEl)    urlEl.value = e.engine_url || '';
  const activeEl = document.getElementById('engine-active'); if (activeEl) activeEl.checked = !!e.active;
  const secretEl = document.getElementById('engine-secret'); if (secretEl) secretEl.value = maskSecret(e.webhook_secret);
  const stagesEl = document.getElementById('engine-stages'); if (stagesEl) stagesEl.innerHTML = renderEngineStages(data.stages || [], e.trigger_stage_ids || []);
  setEngineReadOnly(!data.can_manage);
  loadEngineDeliveries();
}

// Only the last four characters are ever shown; the full value stays in engineData.
function maskSecret(v) {
  if (!v) return '—';
  return '••••••••' + String(v).slice(-4);
}

function setEngineReadOnly(readOnly) {
  const card = document.getElementById('engine-card'); if (!card) return;
  card.querySelectorAll('.engine-manage-input, #engine-stages input').forEach(el => { el.disabled = readOnly; });
  card.querySelectorAll('.engine-manage').forEach(el => el.classList.toggle('hidden', readOnly));
  const hint = document.getElementById('engine-readonly-hint'); if (hint) hint.classList.toggle('hidden', !readOnly);
}

// Same chip markup as the Analytics won/lost pickers, grouped by pipeline.
function renderEngineStages(stages, selectedIds) {
  const selected = (selectedIds || []).map(Number);
  const groups = [], byKey = {};
  for (const s of stages || []) {
    const key = s.pipeline_id != null ? String(s.pipeline_id) : String(s.pipeline_name || '');
    if (!byKey[key]) { byKey[key] = { name: s.pipeline_name || '', stages: [] }; groups.push(byKey[key]); }
    byKey[key].stages.push(s);
  }
  if (!groups.length) return `<p class="settings-hint">${esc(t('engine_no_stages'))}</p>`;
  return groups.map(g => `
    <div class="analytics-pipeline-group">
      <div class="analytics-pipeline-sep">${esc(g.name)}</div>
      <div class="analytics-stage-chips">
        ${g.stages.map(s => `<label class="analytics-stage-option"><input type="checkbox" data-id="${Number(s.id)}"${selected.includes(Number(s.id)) ? ' checked' : ''}><span class="analytics-stage-dot" style="background:${esc(s.color || '')}"></span>${esc(s.name)}</label>`).join('')}
      </div>
    </div>`).join('');
}

function getEngineTriggerIds() {
  return [...document.querySelectorAll('#engine-stages input[data-id]:checked')].map(el => parseInt(el.dataset.id, 10)).filter(n => n > 0);
}

function showEngineMsg(text, ok) {
  const msgEl = document.getElementById('engine-msg'); if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className   = 'workspace-name-msg ' + (ok ? 'success' : 'error');
  setTimeout(() => msgEl.classList.add('hidden'), ok ? 2500 : 6000);
}

async function saveEngineSettings(silent = false) {
  const res = await api.patch('/api/engine/settings', {
    engine_url:        document.getElementById('engine-url').value.trim(),
    active:            document.getElementById('engine-active').checked,
    trigger_stage_ids: getEngineTriggerIds(),
  });
  if (res.error) {
    // The server refused (e.g. activating without a URL): undo the toggle so the UI tells the truth.
    if (engineData?.engine) document.getElementById('engine-active').checked = !!engineData.engine.active;
    showEngineMsg(res.error, false);
    return;
  }
  if (engineData) engineData.engine = { ...engineData.engine, ...res.engine, webhook_secret: engineData.engine.webhook_secret };
  if (!silent) showEngineMsg(t('engine_saved'), true);
}

function copyEngineSecret(btn) {
  const secret = engineData?.engine?.webhook_secret;
  if (!secret) return;
  const done = () => { const o = btn.textContent; btn.textContent = t('copied'); setTimeout(() => btn.textContent = o, 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(secret).then(done).catch(() => fallbackCopy(secret, done));
  else fallbackCopy(secret, done);
}

async function regenerateEngineSecret() {
  if (!confirm(t('engine_confirm_regen_secret'))) return;
  const res = await api.post('/api/engine/settings/regenerate-secret', {});
  if (res.error) { showEngineMsg(res.error, false); return; }
  if (engineData?.engine) engineData.engine.webhook_secret = res.webhook_secret;
  const secretEl = document.getElementById('engine-secret'); if (secretEl) secretEl.value = maskSecret(res.webhook_secret);
}

async function sendEngineTestEvent(btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await api.post('/api/engine/test-event', {});
    if (res.error) { showEngineMsg(res.error, false); return; }
    const d = res.delivery || {};
    if (d.status === 'success') showEngineMsg(t('engine_test_ok'), true);
    else showEngineMsg(`${t('engine_test_failed')} ${d.last_error || ''}`.trim(), false);
    loadEngineDeliveries();
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadEngineDeliveries() {
  const el = document.getElementById('engine-deliveries'); if (!el) return;
  const data = await api.get('/api/engine/deliveries');
  const list = data && !data.error ? (data.deliveries || []) : [];
  if (!list.length) { el.innerHTML = `<p class="empty-inline">${esc(t('engine_no_deliveries'))}</p>`; return; }
  el.innerHTML = list.map(engineDeliveryHtml).join('');
}

function engineDeliveryHtml(d) {
  const status = ['success', 'failed', 'pending'].includes(d.status) ? d.status : 'pending';
  const label  = d.deal_title || d.event || '';
  const meta   = [
    `${Number(d.attempts) || 0} ${t(Number(d.attempts) === 1 ? 'engine_attempt_one' : 'engine_attempts')}`,
    d.last_status_code ? `HTTP ${Number(d.last_status_code)}` : '',
    d.contact_name || '',
  ].filter(Boolean).map(m => `<span>${esc(m)}</span>`).join('');
  return `<div class="intg-log-entry${status === 'failed' ? ' error' : ''}">
    <div class="intg-log-entry-header">
      <span class="intg-log-badge ${status}">${esc(t('engine_status_' + status))}</span>
      <span class="intg-log-time">${esc(new Date(d.created_at).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-GB'))}</span>
      <span class="intg-log-contact">${esc(label)}</span>
      <span class="engine-delivery-meta">${meta}</span>
    </div>
    ${d.last_error ? `<div class="intg-log-skipped">${esc(d.last_error)}</div>` : ''}
    <div class="intg-log-raw-toggle" onclick="this.nextElementSibling.classList.toggle('hidden')">${esc(t('engine_view_payload'))}</div>
    <pre class="intg-log-raw hidden">${esc(JSON.stringify(d.payload || {}, null, 2))}</pre>
  </div>`;
}
