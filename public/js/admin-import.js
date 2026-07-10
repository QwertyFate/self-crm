// ── ADMIN PANEL ───────────────────────────────────────────
async function handleAdminLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('admin-login-error'); errEl.classList.add('hidden');
  const res = await api.post('/api/admin/login', { secret: document.getElementById('admin-secret-input').value });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }
  document.getElementById('admin-view-login').classList.add('hidden');
  document.getElementById('admin-view-panel').classList.remove('hidden');
  loadAdminInvites();
}

async function adminLogout(e) {
  e?.preventDefault(); await api.post('/api/admin/logout', {});
  document.getElementById('admin-view-panel').classList.add('hidden');
  document.getElementById('admin-view-login').classList.remove('hidden');
  document.getElementById('admin-secret-input').value = '';
}

async function loadAdminInvites() {
  const invites = await api.get('/api/admin/invites');
  const el = document.getElementById('admin-invites-list');
  if (!invites.length) { el.innerHTML = '<p class="admin-empty">No invite codes yet. Click + Generate to create one.</p>'; return; }
  el.innerHTML = invites.map(inv => `
    <div class="admin-invite-row ${inv.used ? 'used' : ''}">
      <div class="admin-invite-code">${inv.code}</div>
      <div class="admin-invite-meta">
        ${inv.used ? `<span class="admin-badge used">Used · ${esc(inv.used_by_workspace_name || '—')}</span>` : `<span class="admin-badge available">Available</span>`}
        <span class="admin-invite-date">${fmtDate(inv.created_at)}</span>
      </div>
      <div class="admin-invite-actions">
        <button class="btn btn-sm btn-ghost" onclick="adminCopyCode('${inv.code}', this)" title="Copy">📋</button>
        ${!inv.used ? `<button class="btn btn-sm btn-danger" onclick="adminDeleteCode(${inv.id})" title="Delete">✕</button>` : ''}
      </div>
    </div>`).join('');
}

async function adminGenerateCode() {
  const res = await api.post('/api/admin/invites', {}); if (res.error) { alert(res.error); return; } loadAdminInvites();
}
async function adminDeleteCode(id) {
  if (!confirm('Delete this invite code?')) return;
  const res = await api.del(`/api/admin/invites/${id}`); if (res.error) { alert(res.error); return; } loadAdminInvites();
}
function adminCopyCode(code, btn) {
  navigator.clipboard.writeText(code).then(() => { const orig = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = orig; }, 1500); });
}

// ── CSV EXPORT ────────────────────────────────────────────
function exportContactsCSV() {
  if (!contacts.length) { alert('No contacts to export.'); return; }
  const hdrs = ['Name','Company','Email','Phone','Stage','Assignee', ...fields.map(f => f.name)];
  const rows = contacts.map(c => [
    c.name, c.company||'', c.email||'', c.phone||'', c.stage_name||'', c.assigned_to_name||'',
    ...fields.map(f => c.custom_data?.[f.field_key] ?? '')
  ]);
  const csv = [hdrs, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `contacts-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ── CSV IMPORT ────────────────────────────────────────────
async function readFileText(file) {
  const buf = await file.arrayBuffer(), bytes = new Uint8Array(buf);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf).replace(/^﻿/, '');
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf).replace(/^﻿/, '');
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(buf.slice(3));
  return file.text();
}

function detectDelimiter(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const tabs = (first.match(/\t/g)||[]).length, commas = (first.match(/,/g)||[]).length, semis = (first.match(/;/g)||[]).length;
  if (tabs > commas && tabs > semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

function parseCSV(text, delimiter = ',') {
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === delimiter && !inQ) { row.push(cur); cur = ''; }
      else cur += ch;
    }
    row.push(cur); result.push(row);
  }
  return result;
}

function toFieldKey(str) { return str.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }

function autoMapHeader(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, ' ');
  if (['name','full name','contact name','contact','vollständiger_name','vollständiger name','full_name','vor- und nachname'].includes(h)) return 'name';
  if (['email','e-mail','email address','e-mail-adresse','emailadresse','e_mail','email_address'].includes(h)) return 'email';
  if (['phone','mobile','telephone','tel','phone number','phone no','telefonnummer','telefon','handy','mobilnummer','mobile number','phone_number','telefonnr'].includes(h)) return 'phone';
  if (['company','organization','org','account','company name','firma','unternehmen','firmenname'].includes(h)) return 'company';
  if (['stage','status','pipeline stage','deal stage','phase'].includes(h)) return 'stage';
  if (['assignee','owner','assigned to','assigned_to','zuständig'].includes(h)) return 'assignee';
  const cf = fields.find(f => f.name.toLowerCase() === h || f.field_key === toFieldKey(h));
  if (cf) return `custom:${cf.field_key}`;
  return 'skip';
}

async function openImportModal() {
  await ensureMembers();
  importData = null; showImportStep('upload');
  const fi = document.getElementById('import-file-input'); if (fi) fi.value = '';
  document.getElementById('import-modal').classList.remove('hidden');
  loadImportPipelines();
  loadImportAssignees();
}

function toggleImportDealOptions() {
  const opts = document.getElementById('import-deal-options');
  opts.style.display = document.getElementById('import-create-deals').checked ? 'block' : 'none';
  if (document.getElementById('import-create-deals').checked) loadImportPipelines();
}

function loadImportPipelines() {
  const sel = document.getElementById('import-pipeline');
  if (!pipelines?.length) {
    sel.innerHTML = '<option value="">— No pipelines available —</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Select a pipeline —</option>' +
    pipelines.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  sel.onchange = updateImportStages;
}

function loadImportAssignees() {
  const sel = document.getElementById('import-assignee');
  if (!members?.length) {
    sel.innerHTML = '<option value="">— Use default or unassigned —</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Use default or unassigned —</option>' +
    members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
}

function updateImportStages() {
  const pipelineId = parseInt(document.getElementById('import-pipeline').value) || null;
  const sel = document.getElementById('import-stage');
  if (!pipelineId) {
    sel.innerHTML = '<option value="">— Auto (first stage) —</option>';
    return;
  }
  const pipeline = pipelines.find(p => p.id === pipelineId);
  if (!pipeline || !pipeline.stages?.length) {
    sel.innerHTML = '<option value="">— Auto (first stage) —</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Auto (first stage) —</option>' +
    pipeline.stages.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}
function showImportStep(step) {
  ['upload','map','done'].forEach(s => document.getElementById(`import-step-${s}`).classList.toggle('hidden', s !== step));
}
function handleImportDrop(e) { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) processImportFile(file); }
function handleImportFile(e) { const file = e.target.files?.[0]; if (file) processImportFile(file); }

async function processImportFile(file) {
  const text = await readFileText(file), delimiter = detectDelimiter(text), allRows = parseCSV(text, delimiter);
  if (allRows.length < 2) { alert('CSV must have a header row and at least one data row.'); return; }
  await Promise.all([ensureStages(), ensureFields(), ensureMembers()]);
  const headers = allRows[0].map(h => h.trim()), dataRows = allRows.slice(1).filter(r => r.some(v => v.trim())), sampleRow = allRows[1] || [];
  importData = { headers, rows: dataRows, sampleRow, mappings: headers.map(h => ({ mapTo: autoMapHeader(h), newFieldName: h })) };
  renderImportMapping(); showImportStep('map');
}

function updateImportNameOptions() {
  if (importData) renderImportMapping();
}

function renderImportMapping() {
  const { headers, sampleRow, mappings, rows } = importData;
  document.getElementById('import-info-text').textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''} detected — match each column to a CRM field.`;
  const splitName = document.getElementById('import-split-name').checked;
  const builtins = splitName
    ? [{ val:'first_name', label:'First Name' }, { val:'last_name', label:'Last Name' }, { val:'email', label:'Email' }, { val:'phone', label:'Phone' }, { val:'company', label:'Company' }, { val:'stage', label:'Stage' }, { val:'assignee', label:'Assignee' }]
    : [{ val:'name', label:'Name *' }, { val:'email', label:'Email' }, { val:'phone', label:'Phone' }, { val:'company', label:'Company' }, { val:'stage', label:'Stage' }, { val:'assignee', label:'Assignee' }];
  const buildOptions = cur => {
    let o = `<option value="skip"${cur==='skip'?' selected':''}>— Don't import —</option>
      <optgroup label="Contact fields">${builtins.map(b => `<option value="${b.val}"${cur===b.val?' selected':''}>${b.label}</option>`).join('')}</optgroup>`;
    if (fields.length) o += `<optgroup label="Custom fields">${fields.map(f => `<option value="custom:${f.field_key}"${cur===`custom:${f.field_key}`?' selected':''}>${esc(f.name)}</option>`).join('')}</optgroup>`;
    o += `<optgroup label="New field"><option value="new"${cur==='new'?' selected':''}>Create as custom field…</option></optgroup>`;
    return o;
  };
  document.getElementById('import-map-rows').innerHTML = headers.map((h, i) => {
    const sample = (sampleRow[i] || '').trim().slice(0, 60), m = mappings[i];
    return `<div class="import-map-row">
      <div class="import-col-info"><div class="import-col-header">${esc(h)}</div>${sample ? `<div class="import-col-sample">${esc(sample)}</div>` : ''}</div>
      <div class="import-col-arrow">→</div>
      <div class="import-col-map">
        <select class="import-map-sel" onchange="onImportMapChange(this,${i})">${buildOptions(m.mapTo)}</select>
        <input type="text" class="import-new-name${m.mapTo==='new'?'':' hidden'}" placeholder="Field name" value="${esc(m.newFieldName)}"
          oninput="importData.mappings[${i}].newFieldName=this.value" />
      </div>
    </div>`;
  }).join('');
}

function onImportMapChange(sel, idx) {
  importData.mappings[idx].mapTo = sel.value;
  sel.closest('.import-col-map').querySelector('.import-new-name').classList.toggle('hidden', sel.value !== 'new');
}
function importBack() { showImportStep('upload'); document.getElementById('import-file-input').value = ''; importData = null; }

async function runImport() {
  const { headers, rows, mappings } = importData;
  const splitName = document.getElementById('import-split-name').checked;

  if (splitName) {
    if (!mappings.some(m => m.mapTo === 'first_name' || m.mapTo === 'last_name')) {
      alert('Please map at least "First Name" or "Last Name" when splitting names.');
      return;
    }
  } else {
    if (!mappings.some(m => m.mapTo === 'name')) {
      alert('Please map a column to "Name" before importing.');
      return;
    }
  }

  const newFields = [], newKeyByCol = {};
  mappings.forEach((m, i) => {
    if (m.mapTo !== 'new') return;
    const label = (m.newFieldName || headers[i]).trim(), key = toFieldKey(label) || `col_${i}`;
    if (!fields.find(f => f.field_key === key) && !newFields.find(f => f.field_key === key)) newFields.push({ name: label, field_key: key });
    newKeyByCol[i] = toFieldKey((m.newFieldName || headers[i]).trim()) || `col_${i}`;
  });

  const contactsList = rows.map(row => {
    const c = { custom_data: {}, first_name: '', last_name: '' };
    mappings.forEach((m, i) => {
      const val = (row[i] || '').trim(); if (!val || m.mapTo === 'skip') return;
      if      (m.mapTo === 'name')    c.name    = val;
      else if (m.mapTo === 'first_name') c.first_name = val;
      else if (m.mapTo === 'last_name')  c.last_name = val;
      else if (m.mapTo === 'email')   c.email   = val;
      else if (m.mapTo === 'phone')   c.phone   = val.replace(/^p:/i, '').trim();
      else if (m.mapTo === 'company') c.company = val;
      else if (m.mapTo === 'stage')   { const s = stages.find(s => s.name.toLowerCase() === val.toLowerCase()); if (s) c.stage_id = s.id; }
      else if (m.mapTo === 'assignee') { const mem = members.find(mem => mem.name.toLowerCase() === val.toLowerCase() || mem.email.toLowerCase() === val.toLowerCase()); if (mem) c.assigned_to = mem.id; }
      else if (m.mapTo.startsWith('custom:')) c.custom_data[m.mapTo.slice(7)] = val;
      else if (m.mapTo === 'new' && newKeyByCol[i]) c.custom_data[newKeyByCol[i]] = val;
    });

    // Combine first_name and last_name into name if split name is enabled
    if (splitName) {
      c.name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name;
      delete c.first_name;
      delete c.last_name;
    }

    return c;
  }).filter(c => c.name);

  const btn = document.getElementById('import-run-btn');
  btn.disabled = true; btn.textContent = 'Importing…';

  const createDeals = document.getElementById('import-create-deals').checked;
  const createDealsForNew = document.getElementById('import-deals-new').checked;
  const createDealsForUpdated = document.getElementById('import-deals-updated').checked;
  const pipelineId = createDeals ? parseInt(document.getElementById('import-pipeline').value) || null : null;
  const stageId = createDeals ? parseInt(document.getElementById('import-stage').value) || null : null;

  // Get assignee: prefer manually selected one, then fall back to integration default
  let assigneeId = parseInt(document.getElementById('import-assignee').value) || null;
  if (!assigneeId) {
    const intgSettings = await api.get('/api/integrations/settings');
    if (intgSettings?.webhook?.default_assignee_id) {
      assigneeId = intgSettings.webhook.default_assignee_id;
    }
  }

  const res = await api.post('/api/contacts/import', {
    contacts: contactsList,
    newFields,
    createDeals: createDeals && pipelineId,
    createDealsForNew: createDeals && createDealsForNew && pipelineId,
    createDealsForUpdated: createDeals && createDealsForUpdated && pipelineId,
    pipelineId,
    stageId,
    defaultAssigneeId: assigneeId
  });
  btn.disabled = false; btn.textContent = 'Import contacts';
  const dealsCreated = res.deals_created || 0;
  let message = `Successfully imported ${res.imported} contact${res.imported !== 1 ? 's' : ''}.`;
  if (dealsCreated > 0) message += ` Created ${dealsCreated} deal${dealsCreated !== 1 ? 's' : ''}.`;
  document.getElementById('import-done-text').textContent = message;
  showImportStep('done'); invalidate();
}

// ── Boot ──────────────────────────────────────────────────
init();
