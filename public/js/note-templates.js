/* ═══════════════════════════════════════════════════════════════════════════
   NOTE TEMPLATES — texts written once and put into a note with one click, such
   as the questions for a first call (NOTE_EDITOR_CHANGES Part 5;
   routes/note-templates.js has the list and its checks).

   THE BUTTON  "Insert template" is next to every box a note is written in:
   in the deal window and the contact view (the box for a new entry and the
   editor of an existing one; detail-views.js), on the Activities page
   (objects.js) — these three call ntplButtonHtml(fieldId) — and in the
   Calendar's "Log activity" window, whose button is plain markup in
   index.html. Its data-tpl names the text field the template goes into. One
   listener on the document opens the list for any such button, so no view
   needs wiring of its own.

   THE LIST  ntplMenu() asks the server each time — the list is small and so
   is always current, also after a colleague added one — and shows the
   workspace's templates by name, then "Add template" and "Manage templates".

   INSERTING  ntplInsert() puts the text at the cursor, on lines of its own,
   and then tells the field it was typed into (an `input` event). The view
   that owns the field therefore treats it like typing: the new entry's draft
   is kept, an edited note saves itself, the editor grows. The note is saved
   as any note is; nothing marks it as coming from a template.

   ADDING, CHANGING, DELETING  every member may (the route allows it). The
   form asks before it is closed with unsaved text, like the note boxes do.

   FUNCTION MAP  ntplButtonHtml, ntplInserted, ntplInsert, ntplMenu, ntplForm,
                 ntplListHtml, ntplManage, ntplErrorText
   ═══════════════════════════════════════════════════════════════════════════ */

const NTPL_MAX_NAME = 80, NTPL_MAX_TEXT = 20000;   // the route's limits (routes/note-templates.js)
// The route's refusal codes as sentences.
const NTPL_ERRORS = { name: 'ntpl_err_name', content: 'ntpl_err_content', name_taken: 'ntpl_err_name_taken', limit: 'ntpl_err_limit', not_found: 'ntpl_err_gone' };
function ntplErrorText(res) { return t(NTPL_ERRORS[res && res.code] || 'ntpl_err_generic'); }

function ntplButtonHtml(fieldId, disabled = false) {
  return `<button type="button" class="btn btn-ghost btn-sm ntpl-btn" data-tpl="${esc(fieldId)}" aria-haspopup="menu"${disabled ? ' disabled' : ''}>${icon('file-text')}${esc(t('ntpl_insert'))}</button>`;
}

// `text` put into `value` where the selection start…end is: { value, caret }. The template stands on lines of its
// own — a line break is added before it and after it where text touches it. A cursor at the very start of a field
// that already has text is where a field sits that was never clicked into: the template then goes to the end, so it
// never lands above what is written.
function ntplInserted(value, start, end, text) {
  const v = String(value ?? ''), body = String(text ?? '').replace(/\r\n?/g, '\n');
  let a = Math.max(0, Math.min(Number.isInteger(start) ? start : v.length, v.length));
  let b = Math.max(a, Math.min(Number.isInteger(end) ? end : a, v.length));
  if (a === 0 && b === 0 && v.trim()) a = b = v.length;
  const before = v.slice(0, a), after = v.slice(b);
  const lead = before && !before.endsWith('\n') ? '\n' : '', trail = after && !after.startsWith('\n') ? '\n' : '';
  return { value: before + lead + body + trail + after, caret: (before + lead + body).length };
}

function ntplInsert(field, text) {
  if (!field || field.disabled) return;
  const out = ntplInserted(field.value, field.selectionStart, field.selectionEnd, text);
  field.value = out.value;
  field.focus();
  try { field.setSelectionRange(out.caret, out.caret); } catch (e) { /* not a text field */ }
  field.dispatchEvent(new Event('input', { bubbles: true }));   // the view that owns the field hears it as typing
}

// The list under an "Insert template" button.
async function ntplMenu(button) {
  const res = await api.get('/api/note-templates');
  const list = res && Array.isArray(res.templates) ? res.templates : [];
  if (!document.body.contains(button)) return;   // the view was rebuilt while the list was fetched
  const field = () => document.getElementById(button.dataset.tpl);
  ui.menu(button, [
    ...(list.length ? list.map(tp => ({ label: tp.name, icon: 'file-text', onSelect: () => ntplInsert(field(), tp.content) })) : [{ heading: t('ntpl_none') }]),
    { sep: true },
    { label: t('ntpl_add'), icon: 'plus', onSelect: () => ntplForm(null) },
    ...(list.length ? [{ label: t('ntpl_manage'), icon: 'settings', onSelect: () => ntplManage() }] : []),
  ]);
}

// The form for a new template (tpl null) or an existing one. onDone(template) after a save.
function ntplForm(tpl, { onDone } = {}) {
  const id = 'ntpl-' + uid(), start = { name: tpl ? tpl.name : '', text: tpl ? tpl.content : '' };
  const m = ui.modal({ title: t(tpl ? 'ntpl_title_edit' : 'ntpl_title_add'), size: 'lg',
    body: `<form id="${id}" novalidate>
        <div class="field"><label class="label" for="${id}-name">${esc(t('ntpl_name'))}</label>
          <input class="input" id="${id}-name" maxlength="${NTPL_MAX_NAME}" autocomplete="off" placeholder="${esc(t('ntpl_name_ph'))}" value="${esc(start.name)}"></div>
        <div class="field"><label class="label" for="${id}-text">${esc(t('ntpl_text'))}</label>
          <textarea class="textarea" id="${id}-text" rows="14" maxlength="${NTPL_MAX_TEXT}" placeholder="${esc(t('ntpl_text_ph'))}">${esc(start.text)}</textarea>
          <p class="help">${esc(t('ntpl_text_hint'))}</p></div>
        <div class="error-text" id="${id}-err" role="alert" hidden></div></form>`,
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_cancel'))}</button><button class="btn btn-primary" data-ntpl-save>${esc(t('btn_save'))}</button>`,
    // typed and not saved: the same question as for a note (detail-views.js)
    beforeClose: () => { const now = read(); return (now.name === start.name && now.text === start.text) || typeof dvConfirmUnsaved !== 'function' || dvConfirmUnsaved(); } });
  const el = part => m.el.querySelector(`#${id}-${part}`);
  function read() { return { name: el('name').value.trim(), text: el('text').value }; }
  const fail = text => { const e = el('err'); e.textContent = text; e.hidden = false; };
  async function save() {
    const now = read();
    if (!now.name) { fail(t('ntpl_err_name')); el('name').focus(); return; }
    if (!now.text.trim()) { fail(t('ntpl_err_content')); el('text').focus(); return; }
    const body = { name: now.name, content: now.text };
    const res = tpl ? await api.put(`/api/note-templates/${tpl.id}`, body) : await api.post('/api/note-templates', body);
    if (!res || res.error || !res.template) { fail(ntplErrorText(res)); if (res && (res.code === 'name' || res.code === 'name_taken')) el('name').focus(); return; }
    m.close();   // saved: closed without the question
    ui.toast(t('ntpl_saved'));
    if (onDone) onDone(res.template);
  }
  on(m.el, 'click', '[data-ntpl-save]', () => save());
  on(m.el, 'submit', 'form', e => { e.preventDefault(); save(); });
  on(m.el, 'input', 'input, textarea', () => { el('err').hidden = true; });
  return m;
}

// The rows of the "Note templates" window: the name, the text's first line, and the two buttons.
function ntplListHtml(list) {
  if (!list.length) return `<div class="empty">${icon('file-text')}<b>${esc(t('ntpl_none'))}</b><div>${esc(t('ntpl_empty_hint'))}</div></div>`;
  return `<ul class="ntpl-list">${list.map(tp => {
    const first = String(tp.content || '').split('\n').map(s => s.trim()).find(Boolean) || '';
    return `<li class="ntpl-row"><div class="ntpl-what"><b>${esc(tp.name)}</b><span class="muted truncate">${esc(first.slice(0, 120))}</span></div>
      <button class="iconbtn" data-ntpl-edit="${Number(tp.id)}" aria-label="${esc(tf('ntpl_edit_aria', { name: tp.name }))}" title="${esc(t('btn_edit'))}">${icon('pencil')}</button>
      <button class="iconbtn" data-ntpl-del="${Number(tp.id)}" aria-label="${esc(tf('ntpl_delete_aria', { name: tp.name }))}" title="${esc(t('btn_delete'))}">${icon('trash')}</button></li>`;
  }).join('')}</ul>`;
}

// The "Note templates" window: every template with Edit and Delete, and "Add template".
async function ntplManage() {
  let list = [];
  const m = ui.modal({ title: t('ntpl_title_manage'), size: 'md', body: '<div data-ntpl-box></div>',
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_close'))}</button><button class="btn btn-primary" data-ntpl-add>${icon('plus')}${esc(t('ntpl_add'))}</button>` });
  const box = m.el.querySelector('[data-ntpl-box]');
  const load = async () => {
    const res = await api.get('/api/note-templates');
    list = res && Array.isArray(res.templates) ? res.templates : [];
    box.innerHTML = ntplListHtml(list);
  };
  on(m.el, 'click', '[data-ntpl-add]', () => ntplForm(null, { onDone: load }));
  on(m.el, 'click', '[data-ntpl-edit]', (e, b) => { const tp = list.find(x => x.id === Number(b.dataset.ntplEdit)); if (tp) ntplForm(tp, { onDone: load }); });
  on(m.el, 'click', '[data-ntpl-del]', async (e, b) => {
    const tp = list.find(x => x.id === Number(b.dataset.ntplDel)); if (!tp) return;
    const ok = await ui.confirm({ title: t('ntpl_delete_q'), message: tf('ntpl_delete_msg', { name: tp.name }), confirmLabel: t('btn_delete'), danger: true });
    if (!ok) return;
    const res = await api.del(`/api/note-templates/${tp.id}`);
    if (res && res.error && res.code !== 'not_found') return ui.toast(ntplErrorText(res));   // deleted by a colleague meanwhile is deleted all the same
    await load();
    ui.toast(t('ntpl_deleted'));
  });
  await load();
  return m;
}

// Every "Insert template" button on the page opens its list here.
document.addEventListener('click', e => {
  const b = e.target && e.target.closest ? e.target.closest('[data-tpl]') : null;
  if (!b || b.disabled) return;
  e.preventDefault();
  ntplMenu(b);
});
