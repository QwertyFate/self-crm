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
   A text is inserted at once; a questionnaire opens its answer window.

   INSERTING  ntplInsert() puts the text at the cursor, on lines of its own,
   and then tells the field it was typed into (an `input` event). The view
   that owns the field therefore treats it like typing: the new entry's draft
   is kept, an edited note saves itself, the editor grows. The note is saved
   as any note is; nothing marks it as coming from a template.

   ADDING, CHANGING, DELETING  every member may (the route allows it). The
   form asks before it is closed with unsaved text, like the note boxes do.

   TEXT OR QUESTIONNAIRE (Part 8)  the form has two kinds, chosen at its top.
   A text is written into one box. A questionnaire is a list of questions,
   one per row, which can be added, removed and moved up or down; Enter in a
   row adds the next one. What is typed for one kind is kept while the other
   is looked at; saving sends the kind that is shown ({ name, content } or
   { name, questions }).

   ANSWERING A QUESTIONNAIRE (Part 9)  picking one in a note box does not
   put text into the note at once: ntplAnswer() opens a window with every
   question and a box for its answer. "Insert into note" (or Ctrl+Enter)
   then puts the answered questions into the note through ntplInsert() —
   the question, its answer on the next line, a blank line between two — and
   leaves the unanswered ones out. From there it is a note like any other.
   The answers are never sent anywhere by themselves and are not kept.

   FUNCTION MAP  ntplButtonHtml, ntplInserted, ntplInsert, ntplMenu, ntplForm,
                 ntplListHtml, ntplManage, ntplErrorText, ntplKind,
                 ntplQuestions, ntplMoved, ntplQuestionRowsHtml,
                 ntplAnswered, ntplAnswerRowsHtml, ntplAnswer
   ═══════════════════════════════════════════════════════════════════════════ */

const NTPL_MAX_NAME = 80, NTPL_MAX_TEXT = 20000;   // the route's limits (routes/note-templates.js)
const NTPL_MAX_QUESTIONS = 40, NTPL_MAX_QUESTION = 300;   // and its limits for a questionnaire
// The route's refusal codes as sentences.
const NTPL_ERRORS = { name: 'ntpl_err_name', content: 'ntpl_err_content', questions: 'ntpl_err_questions', name_taken: 'ntpl_err_name_taken', limit: 'ntpl_err_limit', not_found: 'ntpl_err_gone' };
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
    // a text goes into the note as it is; a questionnaire first asks for its answers
    ...(list.length ? list.map(tp => (ntplKind(tp) === 'questions'
      ? { label: tp.name, icon: 'list', onSelect: () => ntplAnswer(field, tp) }
      : { label: tp.name, icon: 'file-text', onSelect: () => ntplInsert(field(), tp.content) })) : [{ heading: t('ntpl_none') }]),
    { sep: true },
    { label: t('ntpl_add'), icon: 'plus', onSelect: () => ntplForm(null) },
    ...(list.length ? [{ label: t('ntpl_manage'), icon: 'settings', onSelect: () => ntplManage() }] : []),
  ]);
}

// A template that has questions is a questionnaire; every other one is a text.
function ntplKind(tpl) { return tpl && Array.isArray(tpl.questions) && tpl.questions.length ? 'questions' : 'text'; }

// The questions as they are saved: each one line, trimmed, empty rows left out (the route does the same).
function ntplQuestions(list) {
  return (Array.isArray(list) ? list : []).map(q => String(q ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// `list` with the row at `i` moved one place up (by -1) or down (by 1); unchanged where it cannot move.
function ntplMoved(list, i, by) {
  const out = [...list], j = i + by;
  if (!Number.isInteger(i) || i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// The rows of a questionnaire in the form: the number, the question, then up, down and remove.
function ntplQuestionRowsHtml(qs) {
  return qs.map((q, i) => {
    const n = i + 1, name = tf('ntpl_q_ph', { n });
    const btn = (what, key, glyph, off) => `<button type="button" class="iconbtn" data-ntpl-${what}="${i}" aria-label="${esc(tf(key, { n }))}" title="${esc(tf(key, { n }))}"${off ? ' disabled' : ''}>${icon(glyph)}</button>`;
    return `<li class="ntpl-q"><span class="ntpl-q-no" aria-hidden="true">${n}.</span><input class="input" data-ntpl-q="${i}" maxlength="${NTPL_MAX_QUESTION}" autocomplete="off" placeholder="${esc(name)}" aria-label="${esc(name)}" value="${esc(q)}">${
      btn('qup', 'ntpl_q_up', 'arrow-up', i === 0)}${btn('qdown', 'ntpl_q_down', 'arrow-down', i === qs.length - 1)}${btn('qdel', 'ntpl_q_remove', 'x', false)}</li>`;
  }).join('');
}

// What a filled-in questionnaire puts into the note: each answered question with its answer under it, a blank line
// between two. A question without an answer is left out; nothing answered gives ''. An answer keeps its own lines.
function ntplAnswered(questions, answers) {
  const given = Array.isArray(answers) ? answers : [];
  return (Array.isArray(questions) ? questions : [])
    .map((q, i) => [q, String(given[i] ?? '').replace(/\r\n?/g, '\n').trim()])
    .filter(([, a]) => a).map(([q, a]) => `${q}\n${a}`).join('\n\n');
}

// The rows of the window a questionnaire opens: each question as the label of the box its answer is written in.
function ntplAnswerRowsHtml(id, questions) {
  return questions.map((q, i) => `<div class="field ntpl-a"><label class="label" for="${id}-a${i}">${esc(q)}</label><textarea class="textarea" id="${id}-a${i}" data-ntpl-a="${i}" rows="2" placeholder="${esc(t('ntpl_a_ph'))}"></textarea></div>`).join('');
}

// The window a questionnaire opens when it is picked for a note: the questions, a box for each answer, "Insert into
// note". `field` gives the note's text field as it is at that moment — the view under this window may have been
// drawn again meanwhile. Closing with an answer typed asks first, as a note does.
function ntplAnswer(field, tpl) {
  const id = 'ntpl-' + uid(), qs = ntplQuestions(tpl.questions);
  const m = ui.modal({ title: tpl.name, size: 'lg',
    body: `<form id="${id}" novalidate class="col" style="gap:14px;padding-top:4px">
        <p class="help">${esc(t('ntpl_a_hint'))}</p>${ntplAnswerRowsHtml(id, qs)}
        <div class="error-text" id="${id}-err" role="alert" hidden></div></form>`,
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_cancel'))}</button><button class="btn btn-primary" data-ntpl-put>${esc(t('ntpl_a_insert'))}</button>`,
    beforeClose: () => !read().some(a => a.trim()) || typeof dvConfirmUnsaved !== 'function' || dvConfirmUnsaved() });
  const boxes = () => [...m.el.querySelectorAll('[data-ntpl-a]')];
  function read() { return boxes().map(b => b.value); }
  const fail = text => { const e = m.el.querySelector(`#${id}-err`); e.textContent = text; e.hidden = false; };
  function put() {
    const text = ntplAnswered(qs, read());
    if (!text) { fail(t('ntpl_a_err_none')); const first = boxes()[0]; if (first) first.focus(); return; }
    const to = field();
    if (!to || to.disabled) { fail(t('ntpl_a_err_gone')); return; }   // the answers stay here, to be copied
    m.close();   // put into the note: closed without the question
    ntplInsert(to, text);
  }
  on(m.el, 'click', '[data-ntpl-put]', () => put());
  on(m.el, 'submit', 'form', e => { e.preventDefault(); put(); });
  on(m.el, 'input', '[data-ntpl-a]', (e, b) => { m.el.querySelector(`#${id}-err`).hidden = true; if (typeof dvAutoGrow === 'function') dvAutoGrow(b); });
  // Enter is a new line in an answer; with Ctrl or ⌘ it is "Insert into note", as it saves a note elsewhere.
  on(m.el, 'keydown', '[data-ntpl-a]', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); put(); } });
  return m;
}

// The form for a new template (tpl null) or an existing one. onDone(template) after a save.
function ntplForm(tpl, { onDone } = {}) {
  const id = 'ntpl-' + uid(), asks = ntplKind(tpl) === 'questions';
  const start = { name: tpl ? tpl.name : '', text: tpl && !asks ? tpl.content : '', qs: asks ? ntplQuestions(tpl.questions) : [] };
  let kind = asks ? 'questions' : 'text', qs = start.qs.length ? [...start.qs] : [''];   // the rows as typed; an empty first row to start with
  const m = ui.modal({ title: t(tpl ? 'ntpl_title_edit' : 'ntpl_title_add'), size: 'lg',
    body: `<form id="${id}" novalidate class="col" style="gap:14px;padding-top:4px">
        <div class="field"><label class="label" for="${id}-name">${esc(t('ntpl_name'))}</label>
          <input class="input" id="${id}-name" maxlength="${NTPL_MAX_NAME}" autocomplete="off" placeholder="${esc(t('ntpl_name_ph'))}" value="${esc(start.name)}"></div>
        <div class="seg ntpl-kind" role="group" aria-label="${esc(t('ntpl_kind'))}"><button type="button" data-ntpl-kind="text">${esc(t('ntpl_text'))}</button><button type="button" data-ntpl-kind="questions">${esc(t('ntpl_kind_q'))}</button></div>
        <div class="field" data-ntpl-pane="text"><label class="label" for="${id}-text">${esc(t('ntpl_text'))}</label>
          <textarea class="textarea" id="${id}-text" rows="14" maxlength="${NTPL_MAX_TEXT}" placeholder="${esc(t('ntpl_text_ph'))}">${esc(start.text)}</textarea>
          <p class="help">${esc(t('ntpl_text_hint'))}</p></div>
        <div class="field" data-ntpl-pane="questions"><span class="label" id="${id}-qlabel">${esc(t('ntpl_questions'))}</span>
          <ol class="ntpl-qs" id="${id}-qs" aria-labelledby="${id}-qlabel"></ol>
          <div><button type="button" class="btn btn-ghost btn-sm" data-ntpl-qadd>${icon('plus')}${esc(t('ntpl_q_add'))}</button></div>
          <p class="help">${esc(t('ntpl_q_hint'))}</p></div>
        <div class="error-text" id="${id}-err" role="alert" hidden></div></form>`,
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_cancel'))}</button><button class="btn btn-primary" data-ntpl-save>${esc(t('btn_save'))}</button>`,
    // typed and not saved: the same question as for a note (detail-views.js). Looking at the other kind is not typing.
    beforeClose: () => { const now = read(); return (now.name === start.name && now.text === start.text && now.qs.join('\n') === start.qs.join('\n')) || typeof dvConfirmUnsaved !== 'function' || dvConfirmUnsaved(); } });
  const el = part => m.el.querySelector(`#${id}-${part}`);
  function read() { return { name: el('name').value.trim(), text: el('text').value, qs: ntplQuestions(qs) }; }
  const fail = text => { const e = el('err'); e.textContent = text; e.hidden = false; };
  // The rows drawn from `qs`; no row can be added past the route's limit.
  function draw() {
    el('qs').innerHTML = ntplQuestionRowsHtml(qs);
    m.el.querySelector('[data-ntpl-qadd]').disabled = qs.length >= NTPL_MAX_QUESTIONS;
  }
  // The chosen kind is pressed and only its part of the form is shown.
  function show() {
    m.el.querySelectorAll('[data-ntpl-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ntplKind === kind)));
    m.el.querySelectorAll('[data-ntpl-pane]').forEach(p => { p.hidden = p.dataset.ntplPane !== kind; });
  }
  // The cursor into row i: its question, or the button named (after a move, so it can be pressed again).
  function focusRow(i, part = 'q') {
    const want = m.el.querySelector(`[data-ntpl-${part}="${i}"]`), f = want && !want.disabled ? want : m.el.querySelector(`[data-ntpl-q="${i}"]`);
    if (f) f.focus();
  }
  function addAfter(i) {
    if (qs.length >= NTPL_MAX_QUESTIONS) return;
    qs.splice(i + 1, 0, ''); draw(); focusRow(i + 1);
  }
  async function save() {
    const now = read();
    if (!now.name) { fail(t('ntpl_err_name')); el('name').focus(); return; }
    if (kind === 'text' && !now.text.trim()) { fail(t('ntpl_err_content')); el('text').focus(); return; }
    if (kind === 'questions' && !now.qs.length) { fail(t('ntpl_err_questions')); focusRow(0); return; }
    const body = kind === 'questions' ? { name: now.name, questions: now.qs } : { name: now.name, content: now.text };
    const res = tpl ? await api.put(`/api/note-templates/${tpl.id}`, body) : await api.post('/api/note-templates', body);
    if (!res || res.error || !res.template) { fail(ntplErrorText(res)); if (res && (res.code === 'name' || res.code === 'name_taken')) el('name').focus(); return; }
    m.close();   // saved: closed without the question
    ui.toast(t('ntpl_saved'));
    if (onDone) onDone(res.template);
  }
  on(m.el, 'click', '[data-ntpl-save]', () => save());
  on(m.el, 'submit', 'form', e => { e.preventDefault(); save(); });
  on(m.el, 'input', 'input, textarea', () => { el('err').hidden = true; });
  on(m.el, 'click', '[data-ntpl-kind]', (e, b) => { kind = b.dataset.ntplKind; el('err').hidden = true; show(); });
  on(m.el, 'input', '[data-ntpl-q]', (e, f) => { qs[Number(f.dataset.ntplQ)] = f.value; });
  // Enter in a question is "the next question", never "save": a list is typed row after row.
  on(m.el, 'keydown', '[data-ntpl-q]', (e, f) => { if (e.key !== 'Enter' || e.isComposing) return; e.preventDefault(); addAfter(Number(f.dataset.ntplQ)); });
  on(m.el, 'click', '[data-ntpl-qadd]', () => addAfter(qs.length - 1));
  on(m.el, 'click', '[data-ntpl-qdel]', (e, b) => {
    const i = Number(b.dataset.ntplQdel);
    qs.splice(i, 1); if (!qs.length) qs = [''];   // the last row is emptied, not taken away
    draw(); focusRow(Math.min(i, qs.length - 1));
  });
  on(m.el, 'click', '[data-ntpl-qup], [data-ntpl-qdown]', (e, b) => {
    const up = b.dataset.ntplQup !== undefined, i = Number(up ? b.dataset.ntplQup : b.dataset.ntplQdown), by = up ? -1 : 1;
    qs = ntplMoved(qs, i, by); draw(); focusRow(i + by, up ? 'qup' : 'qdown');
  });
  draw(); show();
  return m;
}

// The rows of the "Note templates" window: the name, the text's first line or the number of questions, and the two buttons.
function ntplListHtml(list) {
  if (!list.length) return `<div class="empty">${icon('file-text')}<b>${esc(t('ntpl_none'))}</b><div>${esc(t('ntpl_empty_hint'))}</div></div>`;
  return `<ul class="ntpl-list">${list.map(tp => {
    const n = ntplKind(tp) === 'questions' ? tp.questions.length : 0;
    const first = n ? (n === 1 ? t('ntpl_q_one') : tf('ntpl_q_many', { n })) : String(tp.content || '').split('\n').map(s => s.trim()).find(Boolean) || '';
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
