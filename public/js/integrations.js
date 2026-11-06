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
     calcom    loadCalcomSettings, renderCalcom, calTypeLabel, connectCalcom,
               saveCalcomEventType, refreshCalcomEventTypes, registerCalcomWebhook,
               disconnectCalcom, loadCalcomLogs, showCalMsg
     notetaker loadNotetakerAi, ntAiName, renderNotetakerAi, pickNotetakerAi, showNtAiMsg,
               showNtAiDetail, ntAiErrorText, saveNotetakerAi, removeNotetakerAi
     fonio     loadFonio, renderFonio, updateFonioActive, toggleFonioDay, renderFonioDays, readFonioForm, fonioErrorText, showFonioMsg,
               showFonioDetail, saveFonio, removeFonio, loadFonioCalls, fonioCallHtml, cancelFonioCall
     clipboard copyIntgText, copyIntgJson, fallbackCopy

   3. CAL.COM ("calcom" tab) — one account per workspace. The server says
      can_manage; connect, the event type, refresh and disconnect are shown to
      owners/admins only, members get the account and the event type read-only.
      The key is sent once (POST /calcom/connect) and never comes back.

   4. NOTETAKER ("notetaker" tab) — the AI that writes the summary of a recorded
      meeting, one per workspace (Claude, ChatGPT, Gemini or DeepSeek). Owners and
      admins choose it and paste its key (PUT /notetaker/ai; the server asks the AI
      first); members see which one is set. Hidden while the Notetaker is off;
      "Coming soon" while it is coming soon.

   5. FONIO ("fonio" tab; FONIO_CHANGES) — fonio.ai calls the contact of every
      new deal after the set minutes, inside the calling hours. One account per
      workspace. Owners and admins edit the form (PUT /fonio; a new key is
      checked with fonio first, an empty key field keeps the saved key);
      members see it read-only. Below it, the calls (GET /fonio/calls) with
      cancel for a waiting one (owner/admin).
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
  loadCalcomSettings();
  loadNotetakerAi();
  loadFonio();
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
  loadEngineApiKeys();
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
  document.getElementById('engine-keys-card')?.classList.toggle('hidden', readOnly);   // API keys are a manager's concern only
}

// ── API keys (the Engine's credentials for /api/kunden) ───────────────────────
let engineApiKeys = [];

async function loadEngineApiKeys() {
  const el = document.getElementById('engine-keys'); if (!el) return;
  if (!engineData?.can_manage) return;                      // the card is hidden for members; never fetch the list for them
  const data = await api.get('/api/engine/api-keys');
  engineApiKeys = data && !data.error ? (data.api_keys || []) : [];
  el.innerHTML = renderEngineApiKeys(engineApiKeys, true);
}

// One table row per key. Only the prefix is ever shown — the CRM does not have the key either.
function renderEngineApiKeys(keys, canManage) {
  if (!keys || !keys.length) return `<p class="empty-inline">${esc(t('engine_keys_none'))}</p>`;
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  const when = v => (v ? new Date(v).toLocaleString(locale) : t('engine_keys_never'));
  const head = ['engine_keys_col_name', 'engine_keys_col_key', 'engine_keys_col_created', 'engine_keys_col_last_used'].map(k => `<th>${esc(t(k))}</th>`).join('') + '<th></th>';
  const rows = keys.map(k => {
    const revoked = !!k.revoked_at;
    const action  = canManage && !revoked
      ? `<button type="button" class="btn btn-sm btn-danger" onclick="revokeEngineApiKey(${Number(k.id)})">${esc(t('engine_keys_revoke'))}</button>`
      : '';
    return `<tr${revoked ? ' class="engine-key-revoked"' : ''}>
      <td class="strong">${esc(k.name)}</td>
      <td><code class="engine-key-prefix">${esc(k.key_prefix)}…</code></td>
      <td>${esc(when(k.created_at))}</td>
      <td>${revoked ? `<span class="badge">${esc(t('engine_keys_revoked'))}</span>` : esc(when(k.last_used_at))}</td>
      <td class="engine-key-actions">${action}</td>
    </tr>`;
  }).join('');
  return `<table class="table compact engine-keys-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

// POST creates the key; the plain value appears once in the reveal box and nowhere else.
async function createEngineApiKey(btn) {
  const input = document.getElementById('engine-key-name');
  const name  = input ? input.value.trim() : '';
  if (!name) { ui.toast(t('engine_keys_name_required')); input?.focus(); return; }
  if (btn) btn.disabled = true;
  try {
    const res = await api.post('/api/engine/api-keys', { name });
    if (res.error) { ui.toast(res.error); return; }
    if (input) input.value = '';
    const val = document.getElementById('engine-key-value'); if (val) val.value = res.key || '';
    document.getElementById('engine-key-reveal')?.classList.remove('hidden');
    loadEngineApiKeys();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function copyEngineApiKey(btn) {
  const key = document.getElementById('engine-key-value')?.value;
  if (!key) return;
  const done = () => { const o = btn.textContent; btn.textContent = t('copied'); setTimeout(() => btn.textContent = o, 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(key).then(done).catch(() => fallbackCopy(key, done));
  else fallbackCopy(key, done);
}

// "Done": the key leaves the page. It cannot be shown again.
function hideEngineApiKey() {
  const val = document.getElementById('engine-key-value'); if (val) val.value = '';
  document.getElementById('engine-key-reveal')?.classList.add('hidden');
}

async function revokeEngineApiKey(id) {
  const k = engineApiKeys.find(x => x.id === id);
  const ok = await ui.confirm({
    title: t('engine_keys_revoke'),
    message: tf('engine_keys_confirm_revoke', { name: k?.name || '' }),
    confirmLabel: t('engine_keys_revoke'), danger: true,
  });
  if (!ok) return;
  const res = await api.del(`/api/engine/api-keys/${id}`);
  if (res.error) { ui.toast(res.error); return; }
  ui.toast(t('engine_keys_revoked_toast'));
  loadEngineApiKeys();
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
  updateOnboardingNav();   // the Onboarding monitor link follows the Active switch (onboarding.js)
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

// One counted attempt now (POST /api/engine/deliveries/:id/retry); the list reloads either way.
async function retryEngineDelivery(id, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await api.post(`/api/engine/deliveries/${id}/retry`, {});
    if (res.error) { ui.toast(res.error); return; }
    const d = res.delivery || {};
    ui.toast(d.status === 'success' ? t('engine_retry_ok') : tf('engine_retry_failed', { error: d.last_error || '' }));
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
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  const meta   = [
    `${Number(d.attempts) || 0} ${t(Number(d.attempts) === 1 ? 'engine_attempt_one' : 'engine_attempts')}`,
    d.last_status_code ? `HTTP ${Number(d.last_status_code)}` : '',
    status === 'pending' && d.next_attempt_at ? tf('engine_next_attempt', { when: new Date(d.next_attempt_at).toLocaleString(locale) }) : '',
    d.contact_name || '',
  ].filter(Boolean).map(m => `<span>${esc(m)}</span>`).join('');
  // Retry: managers only; never for a delivered row, a test ping, or a contract event
  // without kunde_id (there is nothing the Engine could do with it).
  const noContact = d.event === 'vertrag.unterschrieben' && (!d.payload || d.payload.kunde_id == null);
  const retry = engineData?.can_manage && status !== 'success' && d.event !== 'test.ping' && !noContact
    ? `<button type="button" class="btn btn-secondary btn-sm engine-retry" onclick="retryEngineDelivery(${Number(d.id)}, this)">${esc(t('engine_btn_retry'))}</button>`
    : '';
  return `<div class="intg-log-entry${status === 'failed' ? ' error' : ''}">
    <div class="intg-log-entry-header">
      <span class="intg-log-badge ${status}">${esc(t('engine_status_' + status))}</span>
      <span class="intg-log-time">${esc(new Date(d.created_at).toLocaleString(locale))}</span>
      <span class="intg-log-contact">${esc(label)}</span>
      <span class="engine-delivery-meta">${meta}</span>${retry}
    </div>
    ${d.last_error ? `<div class="intg-log-skipped">${esc(d.last_error)}</div>` : ''}
    <div class="intg-log-raw-toggle" onclick="this.nextElementSibling.classList.toggle('hidden')">${esc(t('engine_view_payload'))}</div>
    <pre class="intg-log-raw hidden">${esc(JSON.stringify(d.payload || {}, null, 2))}</pre>
  </div>`;
}

// ── Cal.com (the "calcom" tab): one account per workspace ─────────────────────
let calcomData = null;

async function loadCalcomSettings() {
  const data = await api.get('/api/integrations/calcom');
  if (!data || data.error) return;
  calcomData = data;
  renderCalcom();
}

// "30 Minuten (30 Min.)" and, when Cal.com hides the type from its booking page, a tag.
function calTypeLabel(x) {
  let s = x.title || x.slug || String(x.id);
  if (x.lengthInMinutes) s += ` (${tf('cal_minutes', { n: x.lengthInMinutes })})`;
  if (x.hidden) s += ` [${t('cal_hidden_tag')}]`;
  return s;
}

// Everything is decided by two flags from the server: connected and can_manage.
// The disabling here is cosmetic — the routes are the real gate.
// ── the setup guide, in the Platforms tab's clothes (Part 13) ─────────────────
// The same panel the Make / Zapier / n8n guides use: a logo header, "Einrichtungsanleitung",
// numbered steps whose strings carry <strong>/<code> markup (inserted as-is, like theirs), and a
// closing note. Open while nothing is connected; folded to its header once connected, with a button
// that opens it again (the event-type, Google Meet and webhook steps matter after connecting too).
// Cal.com's own menu labels are quoted in the page's language, because Cal.com's UI is localised.
const CAL_GUIDE = {
  logo: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="40" height="40" rx="9" fill="#111111"/><text x="20" y="25.5" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" letter-spacing="-0.5" fill="#ffffff">Cal</text></svg>`,
  steps: ['cal_guide_step1', 'cal_guide_step2', 'cal_guide_step3', 'cal_guide_step4', 'cal_guide_step5', 'cal_guide_step6', 'cal_guide_step7'],
  note: 'cal_guide_note',
};
let calGuideOpen = null;   // null: open while not connected, folded once connected; a click decides from then on
function renderCalcomGuide(connected) {
  const panel = document.getElementById('cal-guide-panel'); if (!panel) return;
  const open = calGuideOpen === null ? !connected : calGuideOpen;
  const steps = CAL_GUIDE.steps.map(k => `<li>${t(k)}</li>`).join('');   // dictionary strings with markup — inserted as-is, as the Platforms guides are
  panel.innerHTML = `
    <div class="intg-guide-header">
      <div class="intg-guide-logo-sm">${CAL_GUIDE.logo}</div>
      <div>
        <div class="intg-guide-title-text">${esc(t('cal_guide_title'))}</div>
        <div class="intg-guide-subtitle">${esc(t('intg_setup_guide'))}</div>
      </div>
      <button type="button" class="btn btn-sm intg-guide-toggle" onclick="toggleCalcomGuide()" aria-expanded="${open}" aria-controls="cal-guide-steps">${esc(open ? t('cal_guide_hide') : t('cal_guide_show'))}</button>
    </div>
    ${open ? `<ol class="intg-guide-steps" id="cal-guide-steps">${steps}</ol><div class="intg-guide-note">${t(CAL_GUIDE.note)}</div>` : ''}`;
}
function toggleCalcomGuide() {
  const connected = !!calcomData?.connected && !!calcomData?.calcom;
  calGuideOpen = !(calGuideOpen === null ? !connected : calGuideOpen);
  renderCalcomGuide(connected);
}

function renderCalcom() {
  const d = calcomData;
  const card = document.getElementById('cal-card'); if (!d || !card) return;
  const c = d.calcom, manage = !!d.can_manage, connected = !!d.connected && !!c;
  const show = (id, on) => document.getElementById(id)?.classList.toggle('hidden', !on);
  const status = document.getElementById('cal-status');
  if (status) { status.textContent = connected ? t('cal_status_connected') : t('cal_status_none'); status.className = 'badge' + (connected ? ' badge-success' : ''); }
  show('cal-readonly-hint', !manage);
  show('cal-connect-section', manage && !connected);
  show('cal-none', !manage && !connected);
  show('cal-account-section', connected);
  show('cal-type-section', connected);
  show('cal-actions', manage);
  show('cal-connect-btn', manage && !connected);
  show('cal-refresh-btn', manage && connected);
  show('cal-register-btn', manage && connected && !c?.webhook_registered);
  show('cal-disconnect-btn', manage && connected);
  show('cal-log-section', connected);
  show('cal-guide-section', manage);   // the guide is for whoever can connect; open until connected, folded after
  renderCalcomGuide(connected);
  if (!connected) return;
  loadCalcomLogs();
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  const when = c.connected_at ? new Date(c.connected_at).toLocaleString(locale) : '';
  const facts = [
    [t('cal_fact_account'),      [c.cal_name, c.cal_email].filter(Boolean).join(', ')],
    [t('cal_fact_username'),     c.cal_username || ''],
    [t('cal_fact_timezone'),     c.cal_timezone || ''],
    [t('cal_fact_connected_by'), c.connected_by_name ? tf('cal_connected_by_on', { name: c.connected_by_name, date: when }) : when],
    [t('cal_fact_webhook'),      c.webhook_registered ? t('cal_webhook_on') : t('cal_webhook_off') + (c.last_error ? ', ' + c.last_error : '') + '. ' + t('cal_webhook_hint')],
  ];
  const facts_el = document.getElementById('cal-facts');
  if (facts_el) facts_el.innerHTML = `<table class="table compact"><tbody>${facts.map(([k, v]) => `<tr><td class="strong">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
  const sel = document.getElementById('cal-event-type'), ro = document.getElementById('cal-type-readonly');
  if (!sel || !ro) return;
  if (manage) {
    const types = Array.isArray(c.event_types) ? c.event_types : [];
    sel.innerHTML = types.length
      ? types.map(x => `<option value="${Number(x.id)}"${c.event_type && c.event_type.id === x.id ? ' selected' : ''}>${esc(calTypeLabel(x))}</option>`).join('')
      : `<option value="">${esc(t('cal_no_event_types'))}</option>`;
    sel.disabled = !types.length;
    sel.classList.remove('hidden'); ro.classList.add('hidden');
  } else {
    sel.classList.add('hidden'); ro.classList.remove('hidden');
    ro.value = c.event_type ? calTypeLabel(c.event_type) : t('cal_no_event_types');
  }
}

function showCalMsg(text, ok) {
  const el = document.getElementById('cal-msg'); if (!el) return;
  el.textContent = text;
  el.className   = 'workspace-name-msg ' + (ok ? 'success' : 'error');
  setTimeout(() => el.classList.add('hidden'), ok ? 2500 : 8000);
}

// The key goes to the server once; the field is emptied whatever the outcome of the request.
async function connectCalcom(btn) {
  const input = document.getElementById('cal-key');
  const api_key = input ? input.value.trim() : '';
  if (!api_key) { showCalMsg(t('cal_key_required'), false); input?.focus(); return; }
  if (btn) btn.disabled = true;
  try {
    const res = await api.post('/api/integrations/calcom/connect', { api_key });
    if (input) input.value = '';
    if (!res || res.error) { showCalMsg(res?.error || t('cal_err_generic'), false); return; }
    calcomData = res; renderCalcom();
    showCalMsg(t('cal_connected_ok'), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveCalcomEventType() {
  const sel = document.getElementById('cal-event-type');
  const id = Number(sel?.value);
  if (!id) return;
  const res = await api.patch('/api/integrations/calcom', { event_type_id: id });
  if (!res || res.error) { showCalMsg(res?.error || t('cal_err_generic'), false); renderCalcom(); return; }
  calcomData = res; renderCalcom();
  showCalMsg(t('cal_saved'), true);
}

async function refreshCalcomEventTypes(btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await api.post('/api/integrations/calcom/refresh', {});
    if (!res || res.error) { showCalMsg(res?.error || t('cal_err_generic'), false); return; }
    calcomData = res; renderCalcom();
    showCalMsg(t('cal_refreshed'), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Retry the booking webhook at Cal.com; the server answers the card's state either way.
async function registerCalcomWebhook(btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await api.post('/api/integrations/calcom/register-webhook', {});
    if (!res) { showCalMsg(t('cal_err_generic'), false); return; }
    if (res.calcom !== undefined) { calcomData = { connected: res.connected, calcom: res.calcom, can_manage: res.can_manage }; renderCalcom(); }
    if (res.error) { showCalMsg(res.error, false); return; }
    showCalMsg(t('cal_registered_ok'), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// The last 30 deliveries from Cal.com: what was booked, moved or cancelled, and what became of it.
async function loadCalcomLogs() {
  const el = document.getElementById('cal-log'); if (!el) return;
  const data = await api.get('/api/integrations/calcom/logs');
  const logs = data && !data.error ? (data.logs || []) : [];
  if (!logs.length) { el.innerHTML = `<p class="empty-inline">${esc(t('cal_log_none'))}</p>`; return; }
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  el.innerHTML = logs.map(l => {
    const c = l.captured || {};
    const what = c.trigger && TRANSLATIONS[currentLang]?.['cal_log_' + c.trigger] ? t('cal_log_' + c.trigger) : (c.trigger || '');
    const when = [c.event_date, c.event_time].filter(Boolean).join(' ');
    const notes = [c.created_contact ? t('cal_log_new_contact') : '', c.created_deal ? t('cal_log_new_deal') : ''].filter(Boolean).join(', ');
    return `<div class="intg-log-entry${l.status === 'error' ? ' error' : ''}">
      <div class="intg-log-entry-header">
        <span class="intg-log-badge ${l.status}">${esc(t('intg_log_' + l.status))}</span>
        <span class="intg-log-time">${esc(new Date(l.created_at).toLocaleString(locale))}</span>
        <span class="intg-log-contact">${esc([what, l.contact_name].filter(Boolean).join(': ') || l.error || '')}</span>
      </div>
      ${l.status === 'success' ? `<div class="intg-log-fields">${[c.title ? `<span class="intg-log-field">${esc(c.title)}</span>` : '', when ? `<span class="intg-log-field">${esc(when)}</span>` : '', notes ? `<span class="intg-log-field">${esc(notes)}</span>` : ''].join('')}</div>` : (l.error ? `<div class="intg-log-fields"><span class="intg-log-field">${esc(l.error)}</span></div>` : '')}
    </div>`;
  }).join('');
}

async function disconnectCalcom() {
  const ok = await ui.confirm({ title: t('cal_btn_disconnect'), message: t('cal_confirm_disconnect'), confirmLabel: t('cal_btn_disconnect'), danger: true });
  if (!ok) return;
  const res = await api.del('/api/integrations/calcom');
  if (!res || res.error) { showCalMsg(res?.error || t('cal_err_generic'), false); return; }
  calcomData = res; renderCalcom();
  showCalMsg(t('cal_disconnected_ok'), true);
}

// ── Notetaker: the summary AI (the "notetaker" tab; NOTETAKER_AI_CHANGES Part 5) ──
// One AI per workspace writes the summary of a recorded meeting: Claude, ChatGPT, Gemini or DeepSeek, with its API
// key and an optional model. The server says can_manage: owners and admins choose the AI, paste the key and save (the
// server asks the AI first, utils/llm-check.js) or remove it; members see which AI is set. The key goes to the server
// once and never comes back, only its last four characters do, to owners and admins. The tab is hidden in the markup
// and shown once the server answers: with the Notetaker's switch off it answers 404 and the tab stays hidden. While
// the Notetaker is coming soon, the server answers { soon: true }, and the card shows only "Coming soon" (Part 10).
const NT_AI_NAMES = { claude: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', deepseek: 'DeepSeek' };   // brand names, the same in both languages
let ntAiData = null;
let ntAiPick = null;   // the AI chosen in the form: the saved one, until another is clicked

async function loadNotetakerAi() {
  const data = await api.get('/api/integrations/notetaker/ai');
  const on = !!data && !data.error;
  document.querySelector('#page-integrations .settings-tab[data-tab="notetaker"]')?.classList.toggle('hidden', !on);
  if (!on) { if (currentIntgTab === 'notetaker') switchIntgTab('webhook'); return; }
  ntAiData = data;
  ntAiPick = data.ai?.provider || null;
  renderNotetakerAi();
}

function ntAiName(p) { return NT_AI_NAMES[p] || String(p || ''); }

// Everything follows two flags from the server, configured and can_manage, and the AI chosen in the form.
// The hiding here is cosmetic: the routes are the real gate.
function renderNotetakerAi() {
  const d = ntAiData;
  const card = document.getElementById('nt-ai-card'); if (!d || !card) return;
  const soon = d.soon === true;   // coming soon: the note, nothing to read or set
  const a = d.ai, manage = !soon && !!d.can_manage, set = !soon && !!d.configured && !!a;
  const show = (id, on) => document.getElementById(id)?.classList.toggle('hidden', !on);
  const status = document.getElementById('nt-ai-status');
  if (status) { status.textContent = soon ? t('nt_ai_status_soon') : set ? t('nt_ai_status_set') : t('nt_ai_status_none'); status.className = 'badge' + (set ? ' badge-success' : ''); }
  show('nt-ai-soon', soon);
  show('nt-ai-readonly-hint', !soon && !manage);
  show('nt-ai-none', !soon && !set);
  show('nt-ai-current-section', set);
  show('nt-ai-form-section', manage);
  show('nt-ai-actions', manage);
  show('nt-ai-remove-btn', manage && set);
  const seg = document.getElementById('nt-ai-provider');
  if (seg) {
    seg.innerHTML = (Array.isArray(d.providers) ? d.providers : []).filter(p => NT_AI_NAMES[p])
      .map(p => `<button type="button" data-provider="${esc(p)}" aria-pressed="${p === ntAiPick}">${esc(ntAiName(p))}</button>`).join('');
    seg.onclick = e => { const b = e.target.closest('[data-provider]'); if (b) pickNotetakerAi(b.dataset.provider); };
  }
  // the model field shows the saved model while the saved AI is chosen; another AI starts empty (its own default)
  const model = document.getElementById('nt-ai-model');
  if (model) model.value = set && ntAiPick === a.provider ? (a.model || '') : '';
  const facts_el = document.getElementById('nt-ai-facts');
  if (!set || !facts_el) return;
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  const when = a.saved_at ? new Date(a.saved_at).toLocaleString(locale) : '';
  const facts = [
    [t('nt_ai_fact_ai'),       ntAiName(a.provider)],
    [t('nt_ai_fact_model'),    a.model || t('nt_ai_model_default')],
    ...(manage && a.key_hint ? [[t('nt_ai_fact_key'), '…' + a.key_hint]] : []),
    [t('nt_ai_fact_saved_by'), a.saved_by_name ? tf('nt_ai_saved_by_on', { name: a.saved_by_name, date: when }) : when],
  ];
  facts_el.innerHTML = `<table class="table compact"><tbody>${facts.map(([k, v]) => `<tr><td class="strong">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
}

function pickNotetakerAi(p) {
  if (!ntAiData || !NT_AI_NAMES[p]) return;
  ntAiPick = p;
  renderNotetakerAi();
  document.getElementById('nt-ai-key')?.focus();
}

function showNtAiMsg(text, ok) {
  const el = document.getElementById('nt-ai-msg'); if (!el) return;
  el.textContent = text;
  el.className   = 'workspace-name-msg ' + (ok ? 'success' : 'error');
  setTimeout(() => el.classList.add('hidden'), ok ? 2500 : 8000);
}

// The AI's own words under the buttons (they come from the AI, so they stay in its language); empty hides the line.
function showNtAiDetail(text) {
  const el = document.getElementById('nt-ai-detail'); if (!el) return;
  el.textContent = text ? tf('nt_ai_detail', { detail: text }) : '';
  el.classList.toggle('hidden', !text);
}

// What a refused save says, by the server's reason, in the page's language.
function ntAiErrorText(res, provider, model) {
  const ai = ntAiName(provider);
  const byReason = {
    provider:    t('nt_ai_pick_required'),
    key_shape:   t('nt_ai_err_key_shape'),
    model_shape: t('nt_ai_err_model_shape'),
    key:         tf('nt_ai_err_key', { ai }),
    model:       tf('nt_ai_err_model', { ai, model }),
    unreachable: tf('nt_ai_err_unreachable', { ai }),
    refused:     tf('nt_ai_err_refused', { ai }),
  };
  return byReason[res?.reason] || t('nt_ai_err_generic');
}

// The key goes to the server once; the field is emptied whatever the answer. The server asks the AI before it saves,
// which can take a few seconds, so the button says so meanwhile.
async function saveNotetakerAi(btn) {
  const input = document.getElementById('nt-ai-key'), modelEl = document.getElementById('nt-ai-model');
  const provider = ntAiPick;
  if (!provider) { showNtAiMsg(t('nt_ai_pick_required'), false); return; }
  const api_key = input ? input.value.trim() : '';
  if (!api_key) { showNtAiMsg(t('nt_ai_key_required'), false); input?.focus(); return; }
  const model = modelEl ? modelEl.value.trim() : '';
  showNtAiDetail('');
  if (btn) { btn.disabled = true; btn.textContent = t('nt_ai_checking'); }
  try {
    const res = await api.put('/api/integrations/notetaker/ai', { provider, api_key, model });
    if (input) input.value = '';
    if (!res || res.error) {
      showNtAiMsg(ntAiErrorText(res, provider, model), false);
      if (!['model', 'unreachable', 'provider', 'key_shape', 'model_shape'].includes(res?.reason)) showNtAiDetail(res?.error || '');   // a refused key or a busy AI: its own words help
      return;
    }
    ntAiData = res; ntAiPick = res.ai?.provider || provider; renderNotetakerAi();
    showNtAiMsg(tf('nt_ai_saved_ok', { ai: ntAiName(ntAiPick) }), true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('nt_ai_btn_save'); }
  }
}

async function removeNotetakerAi() {
  const ok = await ui.confirm({ title: t('nt_ai_btn_remove'), message: t('nt_ai_confirm_remove'), confirmLabel: t('nt_ai_btn_remove'), danger: true });
  if (!ok) return;
  const res = await api.del('/api/integrations/notetaker/ai');
  if (!res || res.error) { showNtAiMsg(t('nt_ai_err_generic'), false); return; }
  ntAiData = res; ntAiPick = null; showNtAiDetail(''); renderNotetakerAi();
  showNtAiMsg(t('nt_ai_removed_ok'), true);
}

// ── fonio.ai (the "fonio" tab; FONIO_CHANGES Parts 2 and 5) ──
// fonio's AI phone assistant calls the contact of every new deal (made by hand and/or through the lead webhook)
// after the set minutes, inside the calling hours. The server says can_manage: owners and admins edit the form and
// save it (a new key is checked with fonio first; an empty key field keeps the saved key, whose last four characters
// show), members see it read-only. The calls below come from GET /fonio/calls; a waiting one can be cancelled.
// The disabling here is cosmetic: the routes are the real gate.
let fonioData = null;
let fonioDays = [];   // the calling days picked in the form, 1 = Monday … 7 = Sunday
let fonioCallsCanManage = false;

async function loadFonio() {
  const data = await api.get('/api/integrations/fonio');
  if (!data || data.error) return;
  fonioData = data;
  fonioDays = Array.isArray(data.settings?.hours_days) ? [...data.settings.hours_days] : [];
  renderFonio();
  loadFonioCalls();
}

function renderFonio() {
  const d = fonioData, card = document.getElementById('fonio-card');
  if (!d || !card) return;
  const s = d.settings || {}, manage = !!d.can_manage, set = !!d.configured;
  const $ = id => document.getElementById(id);
  const status = $('fonio-status');
  if (status) {
    status.textContent = !set ? t('fonio_status_none') : s.active ? t('fonio_status_active') : t('fonio_status_paused');
    status.className = 'badge' + (set && s.active ? ' badge-success' : set ? ' badge-warning' : '');
  }
  $('fonio-readonly-hint')?.classList.toggle('hidden', manage);
  $('fonio-actions')?.classList.toggle('hidden', !manage);
  $('fonio-remove-btn')?.classList.toggle('hidden', !(manage && set));
  const key = $('fonio-key');
  if (key) key.placeholder = set && s.key_hint ? tf('fonio_key_ph_keep', { hint: s.key_hint }) : t('fonio_key_ph');
  const val = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };
  const chk = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
  val('fonio-from', s.from_number);
  chk('fonio-active', s.active);
  chk('fonio-on-manual', s.on_deal_manual);
  chk('fonio-on-webhook', s.on_deal_webhook);
  val('fonio-delay', s.delay_minutes);
  val('fonio-cc', s.country_code);
  val('fonio-prefixes', (s.number_prefixes || []).join(', '));
  chk('fonio-hours-on', s.hours_on);
  val('fonio-hours-from', s.hours_from);
  val('fonio-hours-to', s.hours_to);
  const tz = $('fonio-hours-tz');
  if (tz) tz.textContent = set && s.hours_tz ? tf('fonio_hours_tz', { tz: s.hours_tz }) : t('fonio_hours_tz_own');
  const seg = $('fonio-days');
  if (seg) {
    seg.innerHTML = [1, 2, 3, 4, 5, 6, 7].map(n =>
      `<button type="button" data-day="${n}" aria-pressed="${fonioDays.includes(n)}"${manage ? '' : ' disabled'}>${esc(t('fonio_day_' + n))}</button>`).join('');
    seg.onclick = e => { const b = e.target.closest('[data-day]'); if (b && manage) toggleFonioDay(Number(b.dataset.day)); };
  }
  card.querySelectorAll('input').forEach(el => { el.disabled = !manage; });
  updateFonioActive();
  const facts = $('fonio-facts');
  if (facts) {
    if (!set) { facts.innerHTML = ''; return; }
    const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
    const when = s.saved_at ? new Date(s.saved_at).toLocaleString(locale) : '';
    const rows = [
      [t('fonio_fact_number'), s.from_number],
      ...(manage && s.key_hint ? [[t('fonio_fact_key'), '…' + s.key_hint]] : []),
      [t('fonio_fact_saved_by'), s.saved_by_name ? tf('fonio_saved_by_on', { name: s.saved_by_name, date: when }) : when],
    ];
    facts.innerHTML = `<table class="table compact"><tbody>${rows.map(([k, v]) => `<tr><td class="strong">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
  }
}

// Active is the main switch; the two triggers only choose which new deals are called once it is on. While it is off
// in the form (saved or just switched), the triggers are greyed out and a line says that no calls go out. Their
// values stay as they are and are saved with the form, so switching Active on again brings them back.
function updateFonioActive() {
  const active = !!document.getElementById('fonio-active')?.checked;
  const manage = !!fonioData?.can_manage;
  for (const id of ['fonio-on-manual', 'fonio-on-webhook']) {
    const el = document.getElementById(id);
    if (el) el.disabled = !manage || !active;
  }
  document.getElementById('fonio-paused-hint')?.classList.toggle('hidden', active);
}

function toggleFonioDay(n) {
  fonioDays = fonioDays.includes(n) ? fonioDays.filter(x => x !== n) : [...fonioDays, n].sort((a, b) => a - b);
  renderFonioDays();
}

// Only the day buttons: re-rendering the whole card would throw away what is typed in the form.
function renderFonioDays() {
  document.querySelectorAll('#fonio-days [data-day]').forEach(b => b.setAttribute('aria-pressed', String(fonioDays.includes(Number(b.dataset.day)))));
}

// The form as the PUT body. The key is sent only when one is typed; the number starts are split on commas.
function readFonioForm(form) {
  const body = {
    from_number: form.from.trim(),
    active: !!form.active,
    on_deal_manual: !!form.onManual,
    on_deal_webhook: !!form.onWebhook,
    delay_minutes: form.delay === '' ? NaN : Number(form.delay),
    country_code: form.cc.trim(),
    number_prefixes: form.prefixes.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean),
    hours_on: !!form.hoursOn,
    hours_days: [...form.days].sort((a, b) => a - b),
    hours_from: form.hoursFrom,
    hours_to: form.hoursTo,
  };
  const key = form.key.trim();
  if (key) body.api_key = key;
  return body;
}

// What a refused save says, by the server's reason, in the page's language.
function fonioErrorText(res) {
  const byReason = {
    key_required: t('fonio_err_key_required'),
    key_shape:    t('fonio_err_key_shape'),
    from_number:  t('fonio_err_from_number'),
    delay:        t('fonio_err_delay'),
    country_code: t('fonio_err_country_code'),
    prefixes:     t('fonio_err_prefixes'),
    hours_days:   t('fonio_err_hours_days'),
    hours:        t('fonio_err_hours'),
    key:          t('fonio_err_key'),
    refused:      t('fonio_err_refused'),
    unreachable:  t('fonio_err_unreachable'),
  };
  return byReason[res?.reason] || t('fonio_err_generic');
}

function showFonioMsg(text, ok) {
  const el = document.getElementById('fonio-msg'); if (!el) return;
  el.textContent = text;
  el.className   = 'workspace-name-msg ' + (ok ? 'success' : 'error');
  setTimeout(() => el.classList.add('hidden'), ok ? 2500 : 8000);
}

// fonio's own words under the buttons (they come from fonio, so they stay in its language); empty hides the line.
function showFonioDetail(text) {
  const el = document.getElementById('fonio-detail'); if (!el) return;
  el.textContent = text ? tf('fonio_detail', { detail: text }) : '';
  el.classList.toggle('hidden', !text);
}

async function saveFonio(btn) {
  const v = id => document.getElementById(id)?.value ?? '';
  const c = id => !!document.getElementById(id)?.checked;
  const body = readFonioForm({
    key: v('fonio-key'), from: v('fonio-from'), active: c('fonio-active'), onManual: c('fonio-on-manual'),
    onWebhook: c('fonio-on-webhook'), delay: v('fonio-delay'), cc: v('fonio-cc'), prefixes: v('fonio-prefixes'),
    hoursOn: c('fonio-hours-on'), days: fonioDays, hoursFrom: v('fonio-hours-from'), hoursTo: v('fonio-hours-to'),
  });
  showFonioDetail('');
  if (btn) { btn.disabled = true; btn.textContent = body.api_key ? t('fonio_checking') : t('fonio_btn_save'); }
  try {
    const res = await api.put('/api/integrations/fonio', body);
    const keyEl = document.getElementById('fonio-key'); if (keyEl) keyEl.value = '';
    if (!res || res.error) {
      showFonioMsg(fonioErrorText(res), false);
      if (res?.reason === 'key' || res?.reason === 'refused') showFonioDetail(res?.error || '');   // fonio's own words help here
      return;
    }
    fonioData = res;
    fonioDays = [...(res.settings?.hours_days || [])];
    renderFonio();
    showFonioMsg(body.api_key ? t('fonio_saved_key_ok') : t('fonio_saved_ok'), true);
    loadFonioCalls();   // switching it off cancels the waiting calls
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('fonio_btn_save'); }
  }
}

async function removeFonio() {
  const ok = await ui.confirm({ title: t('fonio_btn_remove'), message: t('fonio_confirm_remove'), confirmLabel: t('fonio_btn_remove'), danger: true });
  if (!ok) return;
  const res = await api.del('/api/integrations/fonio');
  if (!res || res.error) { showFonioMsg(t('fonio_err_generic'), false); return; }
  fonioData = res;
  fonioDays = [...(res.settings?.hours_days || [])];
  showFonioDetail('');
  renderFonio();
  showFonioMsg(t('fonio_removed_ok'), true);
  loadFonioCalls();
}

async function loadFonioCalls() {
  const el = document.getElementById('fonio-calls'); if (!el) return;
  const data = await api.get('/api/integrations/fonio/calls');
  const calls = data && !data.error ? (data.calls || []) : [];
  fonioCallsCanManage = !!data?.can_manage;
  el.innerHTML = calls.length ? calls.map(c => fonioCallHtml(c, fonioCallsCanManage)).join('') : `<p class="empty-inline">${esc(t('fonio_calls_none'))}</p>`;
}

const FONIO_CALL_BADGE = { sent: 'success', failed: 'failed', scheduled: 'pending', sending: 'pending' };

// One call of the history. Every value from the server is escaped: contact and deal names are typed by people,
// fonio's message comes from fonio.
function fonioCallHtml(c, manage) {
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  const fmt = x => (x ? new Date(x).toLocaleString(locale) : '');
  const when = c.status === 'scheduled' ? tf('fonio_call_due', { date: fmt(c.due_at) }) : fmt(c.sent_at || c.created_at);
  const who = [c.contact_name, c.deal_title && c.deal_title !== c.contact_name ? c.deal_title : ''].filter(Boolean).join(' · ');
  const reason = c.reason ? (c.reason === 'by_user' && c.cancelled_by_name ? tf('fonio_reason_by_name', { name: c.cancelled_by_name }) : t('fonio_reason_' + c.reason)) : '';
  const fields = [
    c.to_number || c.raw_number,
    t('fonio_trigger_' + c.trigger),
    reason,
    c.message ? tf('fonio_detail', { detail: c.message }) : '',
  ].filter(Boolean);
  const cancel = manage && c.status === 'scheduled'
    ? ` <button class="btn btn-sm btn-ghost" onclick="cancelFonioCall(${Number(c.id)}, this)">${esc(t('fonio_call_cancel'))}</button>` : '';
  return `<div class="intg-log-entry${c.status === 'failed' ? ' error' : ''}">
    <div class="intg-log-entry-header">
      <span class="intg-log-badge ${FONIO_CALL_BADGE[c.status] || ''}">${esc(t('fonio_call_status_' + c.status))}</span>
      <span class="intg-log-time">${esc(when)}</span>
      <span class="intg-log-contact">${esc(who)}</span>${cancel}
    </div>
    <div class="intg-log-fields">${fields.map(f => `<span class="intg-log-field">${esc(f)}</span>`).join('')}</div>
  </div>`;
}

async function cancelFonioCall(id, btn) {
  if (btn) btn.disabled = true;
  const res = await api.post(`/api/integrations/fonio/calls/${Number(id)}/cancel`, {});
  if (!res || res.error) {
    showFonioMsg(res?.reason === 'not_waiting' ? t('fonio_call_not_waiting') : t('fonio_err_generic'), false);
    loadFonioCalls();
    return;
  }
  showFonioMsg(t('fonio_call_cancelled_ok'), true);
  loadFonioCalls();
}
