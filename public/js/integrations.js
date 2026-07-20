// ── INTEGRATIONS ───────────────────────────────────────────
let intgData = null;

// Built-in fields always shown
const INTG_BUILTIN_FIELDS = [
  { key: 'name',    label: 'Name',    placeholder: 'full_name'     },
  { key: 'email',   label: 'Email',   placeholder: 'email'         },
  { key: 'phone',   label: 'Phone',   placeholder: 'phone_number'  },
  { key: 'company', label: 'Company', placeholder: 'company'       },
];

// ── Platform guide definitions ─────────────────────────────
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
    steps: [
      'Create a new Scenario in Make.com. Add a trigger — e.g. <strong>Facebook Lead Ads → Watch leads</strong> or <strong>New lead</strong>, or any other lead source.',
      'Add module: <strong>HTTP → Make a request</strong>. Authentication: <strong>No authentication</strong>. Method: <code>POST</code>.',
      'Paste your Webhook URL (copy from the field at the top).',
      'Body type: <code>Raw</code> · Content-Type: <code>application/json</code>.',
      'Paste the JSON body below into the Body field.',
      'For each value shown as <code>{{1.field_name}}</code> — click that value in Make and select the matching field from your trigger module (module 1). The <code>1</code> is the module number; the part after the dot is the field name from your trigger output.',
      'Save and activate.',
    ],
    jsonNote: `Each value like <code>{{1.full_name}}</code> is a <strong>Make variable</strong>. In the HTTP Body field, click where the value is and use Make's variable picker to select the matching output from your trigger module instead of typing it manually.`,
    jsonLabel: 'JSON Body — paste into Make HTTP module',
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
    steps: [
      'Create a new Zap. Trigger: e.g. <strong>Facebook Lead Ads → New Lead</strong>, or any lead source.',
      'Add Action: <strong>Webhooks by Zapier → POST</strong>. Authentication: <strong>No authentication</strong>.',
      'Paste your Webhook URL (copy from the field at the top). Payload Type: <code>JSON</code>.',
      'In the <strong>Data</strong> section, add one row per field. The key on the left is fixed (e.g. <code>full_name</code>). For the value on the right, click the field and use Zapier\'s field picker to select the matching data from your trigger step.',
      'Test and publish.',
    ],
    jsonNote: `The keys on the left (e.g. <code>full_name</code>) must match exactly. For the values — <strong>do not type them manually</strong>. In Zapier's data section, click the value field and pick the corresponding output from your trigger step using the dropdown.`,
    jsonLabel: 'Key/value pairs to add in Zapier',
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
    steps: [
      'Add your trigger node (e.g. a lead source), then an <strong>HTTP Request</strong> node.',
      'Method: <code>POST</code>. Authentication: <strong>No authentication</strong>.',
      'Paste your Webhook URL (copy from the field at the top).',
      'Body Content Type: <code>JSON</code>.',
      'Paste the JSON below. Each value like <code>{{ $json.field_name }}</code> is an n8n expression — it reads the field named <code>field_name</code> from your trigger node\'s output.',
      'To find the correct field name: run your trigger once, click the output of the trigger node, and check the JSON keys shown there. Use those exact key names inside <code>{{ $json.KEY_HERE }}</code>.',
      'Activate the workflow.',
    ],
    jsonNote: `Each value like <code>{{ $json.full_name }}</code> pulls data from your trigger node. Replace <code>full_name</code> with the exact key name shown in your trigger node's output data. You can drag fields directly from the n8n data panel into the expression editor.`,
    jsonLabel: 'JSON Body — paste into HTTP Request node',
  },
  {
    id: 'custom',
    name: 'Custom / API',
    color: '#64748b',
    logo: `<svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    steps: [
      'Send a <code>POST</code> request to your Webhook URL below (copy it from the field at the top).',
      'Authentication: <strong>No authentication</strong> required.',
      'Set <code>Content-Type: application/json</code>.',
      'Send the JSON body below. The keys are fixed — replace the example values with real data from your source.',
      'A successful response returns <code>{"success": true, "contact_id": 42}</code>.',
    ],
    jsonNote: `The JSON keys (left side, e.g. <code>"full_name"</code>) must match exactly as shown. Replace only the values (right side) with actual data from your source system.`,
    jsonLabel: 'JSON Body',
  },
];

let activeGuideId = null;

function renderIntgPlatforms() {
  const list = document.getElementById('intg-platform-list');
  if (!list) return;
  list.innerHTML = INTG_PLATFORMS.map(p => `
    <button class="intg-platform-card${activeGuideId === p.id ? ' active' : ''}"
      onclick="showIntgGuide('${p.id}')" data-platform="${p.id}">
      <div class="intg-platform-logo">${p.logo}</div>
      <div class="intg-platform-name">${p.name}</div>
    </button>`).join('');
}

// Sample values for JSON preview — keyed by common field names
const INTG_SAMPLE_VALUES = {
  name: 'Jane Doe', full_name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe',
  email: 'jane@example.com', phone: '+49123456789', phone_number: '+49123456789',
  company: 'Acme GmbH', city: 'Berlin', country: 'Germany', address: '123 Main St',
  website: 'https://acme.com', source: 'facebook', campaign: 'summer_2026',
};

function buildGuideJson(platformId) {
  // Read current mapping from inputs (live)
  const mapping = {};
  document.querySelectorAll('#intg-field-map .intg-map-input').forEach(inp => {
    if (inp.value.trim()) mapping[inp.dataset.crm] = inp.value.trim();
  });

  // If no mapping yet, fall back to platform defaults
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
      const sample = INTG_SAMPLE_VALUES[incomingKey] || INTG_SAMPLE_VALUES[crmKey] || 'example value';
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
  const steps     = platform.steps.map(s => `<li>${s}</li>`).join('');
  const noteHtml  = platform.jsonNote
    ? `<div class="intg-json-note">${platform.jsonNote}</div>`
    : '';

  const webhookUrl = document.getElementById('intg-url').value;
  document.getElementById('intg-guide-panel').innerHTML = `
    <div class="intg-guide-header">
      <div class="intg-guide-logo-sm">${platform.logo}</div>
      <div>
        <div class="intg-guide-title-text">${platform.name}</div>
        <div class="intg-guide-subtitle">Setup Guide</div>
      </div>
    </div>
    <div style="margin:16px 0;padding:12px;background:var(--bg-secondary);border-radius:4px;border-left:3px solid var(--primary)">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Webhook URL</div>
      <div style="display:flex;gap:8px;align-items:center">
        <code style="flex:1;word-break:break-all;font-size:12px">${webhookUrl}</code>
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${webhookUrl}');alert('Copied to clipboard!')">Copy</button>
      </div>
    </div>
    <ol class="intg-guide-steps">${steps}</ol>
    ${noteHtml}
    <div class="intg-json-block">
      <div class="intg-json-header">
        <span>${platform.jsonLabel}</span>
        <button class="intg-copy-btn" onclick="copyIntgJson(this)">Copy</button>
      </div>
      <pre class="intg-code">${json}</pre>
    </div>`;
}

async function loadIntegrations() {
  // Clear UI immediately to prevent showing stale data
  const intgFieldMap = document.getElementById('intg-field-map');
  if (intgFieldMap) intgFieldMap.innerHTML = '';

  await ensureMembers();
  const data = await api.get('/api/integrations/settings');
  if (!data || data.error) return;
  intgData = data;

  const { webhook, pipelines, stages } = data;
  const origin = data.base_url || window.location.origin;

  // Webhook URL
  document.getElementById('intg-url').value =
    `${origin}/api/integrations/receive/${webhook.webhook_key}`;
  document.getElementById('intg-active').checked = webhook.active;

  // Field mapping — reset custom keys so they're derived fresh from saved map
  activeCustomKeys = [];
  renderIntgFieldMap(webhook.field_map || {});

  // Deal toggle
  document.getElementById('intg-create-deal').checked = webhook.create_deal;
  document.getElementById('intg-deal-options').classList.toggle('hidden', !webhook.create_deal);

  // Pipeline dropdown
  const pipelineEl = document.getElementById('intg-pipeline');
  pipelineEl.innerHTML = pipelines.map(p =>
    `<option value="${p.id}" ${webhook.pipeline_id == p.id ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');

  // Stage dropdown
  const stageEl = document.getElementById('intg-stage');
  const filteredStages = stages.filter(s =>
    !pipelineEl.value || s.pipeline_name === pipelines.find(p => p.id == pipelineEl.value)?.name
  );
  stageEl.innerHTML = `<option value="">— No stage —</option>` +
    filteredStages.map(s =>
      `<option value="${s.id}" ${webhook.stage_id == s.id ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');

  // Default assignee dropdown
  const assigneeEl = document.getElementById('intg-assignee');
  assigneeEl.innerHTML = `<option value="">— Not set (assigned to self) —</option>` +
    members.map(m =>
      `<option value="${m.id}" ${webhook.default_assignee_id == m.id ? 'selected' : ''}>${esc(m.name)}</option>`
    ).join('');

  renderIntgPlatforms();
  if (!activeGuideId) showIntgGuide('make');
  loadIntgLogs();
}

// activeFieldKeys = set of custom field keys the user has added to the mapping
let activeCustomKeys = [];

function renderIntgFieldMap(fieldMap) {
  const el           = document.getElementById('intg-field-map');
  const customFields = intgData?.contact_fields || [];

  // Determine which custom fields are currently active (either saved in fieldMap or manually added)
  const savedCustomKeys = Object.keys(fieldMap).filter(k =>
    !INTG_BUILTIN_FIELDS.some(b => b.key === k) && customFields.some(f => f.field_key === k)
  );
  // Merge saved + user-added (without duplication)
  activeCustomKeys = [...new Set([...savedCustomKeys, ...activeCustomKeys])];

  el.innerHTML = `
    <div class="intg-map-section-label">Built-in fields</div>
    ${INTG_BUILTIN_FIELDS.map(f => renderFieldRow(f.key, f.label, f.placeholder, fieldMap[f.key] || '', false)).join('')}

    ${activeCustomKeys.length ? `<div class="intg-map-section-label" style="margin-top:14px">Custom fields</div>` : ''}
    ${activeCustomKeys.map(key => {
      const cf = customFields.find(f => f.field_key === key);
      if (!cf) return '';
      return renderFieldRow(key, cf.name, key, fieldMap[key] || '', true);
    }).join('')}

    <div class="intg-map-add-row">
      <select id="intg-add-field-select" class="form-control intg-add-select">
        <option value="">+ Add custom field…</option>
        ${customFields
          .filter(f => !activeCustomKeys.includes(f.field_key))
          .map(f => `<option value="${f.field_key}">${esc(f.name)}</option>`)
          .join('')}
      </select>
      <button class="btn btn-sm" onclick="intgAddField()">Add</button>
    </div>`;
}

function renderFieldRow(key, label, placeholder, value, isCustom) {
  // Use saved value, fall back to the default placeholder
  const displayVal = value || placeholder;
  const removeBtn  = isCustom
    ? `<button class="intg-map-remove" onclick="intgRemoveField('${key}')" title="Remove">×</button>`
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
        <button class="intg-key-edit-btn" onclick="intgToggleKeyEdit(this)" title="Edit key">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path d="M11 2l3 3-9 9H2v-3L11 2z"/></svg>
        </button>
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
  // If empty, restore to placeholder/default
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
  // Preserve current values before re-render
  const current = getIntgFieldMap();
  renderIntgFieldMap(current);
  refreshGuideJson();
  // Auto-save so the webhook receiver immediately knows about the new field
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

// Re-render the active guide's JSON whenever mapping changes
function refreshGuideJson() {
  if (activeGuideId) showIntgGuide(activeGuideId);
}

function loadIntgStages() {
  if (!intgData) return;
  const pipelineId = parseInt(document.getElementById('intg-pipeline').value);
  const pipeline   = intgData.pipelines.find(p => p.id === pipelineId);
  const stages     = intgData.stages.filter(s => s.pipeline_name === pipeline?.name);
  document.getElementById('intg-stage').innerHTML =
    `<option value="">— No stage —</option>` +
    stages.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}

function toggleIntgDeal() {
  const on = document.getElementById('intg-create-deal').checked;
  document.getElementById('intg-deal-options').classList.toggle('hidden', !on);
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
    // show brief indicator near the field map
    const el = document.getElementById('intg-field-map');
    if (el) {
      const tip = document.createElement('div');
      tip.style.cssText = 'font-size:11px;color:var(--primary);text-align:right;margin-top:4px';
      tip.textContent = '✓ Auto-saved';
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
    msgEl.textContent = '✓ Saved';
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
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

async function regenerateWebhookKey() {
  if (!confirm('This will invalidate your current webhook URL. Any active Zapier/Make scenarios will need to be updated. Continue?')) return;
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
    el.innerHTML = '<p class="settings-hint">No activity yet.</p>';
    return;
  }
  el.innerHTML = data.logs.map(l => {
    const skipped  = l.captured?._skipped || {};
    const hasSkips = Object.keys(skipped).length > 0;
    const captured = { ...l.captured };
    delete captured._skipped;

    return `<div class="intg-log-entry${l.status === 'error' ? ' error' : ''}">
      <div class="intg-log-entry-header">
        <span class="intg-log-badge ${l.status}">${l.status}</span>
        <span class="intg-log-time">${new Date(l.created_at).toLocaleString()}</span>
        <span class="intg-log-contact">${l.contact_name ? esc(l.contact_name) : (l.error ? esc(l.error) : '—')}</span>
      </div>
      ${l.status === 'success' ? `
        <div class="intg-log-fields">
          ${Object.entries(captured).filter(([,v]) => v).map(([k, v]) =>
            `<span class="intg-log-field"><span class="intg-log-field-key">${esc(k)}</span>${esc(String(v))}</span>`
          ).join('')}
        </div>
        ${hasSkips ? `<div class="intg-log-skipped">
          Fields not found in payload: ${Object.keys(skipped).map(k => `<code>${esc(k)}</code>`).join(', ')}
          — check that your field mapping keys match the incoming payload.
        </div>` : ''}` : ''}
      <div class="intg-log-raw-toggle" onclick="this.nextElementSibling.classList.toggle('hidden')">View raw payload</div>
      <pre class="intg-log-raw hidden">${esc(JSON.stringify(l.payload || {}, null, 2))}</pre>
    </div>`;
  }).join('');
}

function copyIntgJson(btn) {
  const pre  = btn.closest('.intg-json-block').querySelector('pre');
  const text = pre.textContent.trim();
  const done = () => { const o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = o, 1500); };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
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
