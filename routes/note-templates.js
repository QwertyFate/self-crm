/* ═══════════════════════════════════════════════════════════════════════════
   /api/note-templates — the workspace's note templates (NOTE_EDITOR_CHANGES
   Part 4, 2026-11-18; public/js/note-templates.js).

   A TEMPLATE IS A NAME AND A TEXT. Picking one in a note box puts its text
   into the note, where it can still be changed; the note is then saved as any
   note is, in activities.content. Nothing here writes a note, and the notes
   table knows nothing of templates: only the templates themselves live in
   note_templates, a list of their own per workspace.

   PER WORKSPACE, AND EVERY MEMBER'S. Everyone in the workspace sees the list
   and may add, change and delete any template — as with notes. Who and where
   always come from the session (req.userId, req.workspaceId), never from the
   body.

   THE TEXT IS PLAIN TEXT, kept as typed (line breaks included). It is never
   put into a page as markup: the browser puts it into a text field, and the
   note's own writer escapes it when the note is saved.

   CHECKS  name 1–80 characters after trimming, once per workspace whatever
   its capitals (name_key: the name in lower case, made HERE and not by the
   database, whose LOWER() leaves Ä, Ö, Ü alone under a C locale); text
   1–20,000 characters; at most 50 templates per workspace.
   Every refusal carries a `code` the page turns into a sentence: name,
   content, name_taken, limit, not_found.

   ENDPOINTS
     GET    /      { templates: [{ id, name, content, created_by, updated_at }], max }, by name
     POST   /      { name, content } → 201 { template }
     PUT    /:id   { name, content } → { template }; 404 not_found for another workspace's or none
     DELETE /:id   → { success: true }; 404 not_found
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const MAX_TEMPLATES = 50, MAX_NAME = 80, MAX_CONTENT = 20000;
const COLUMNS = 'id, name, content, created_by, updated_at';
const ERRORS = {
  name:       [400, `A template needs a name of up to ${MAX_NAME} characters`],
  content:    [400, `A template needs a text of up to ${MAX_CONTENT} characters`],
  name_taken: [409, 'A template with this name exists already'],
  limit:      [409, `A workspace has at most ${MAX_TEMPLATES} templates`],
  not_found:  [404, 'Template not found'],
};
const refuse = (res, code) => res.status(ERRORS[code][0]).json({ error: ERRORS[code][1], code });
const idOf = v => (/^[1-9]\d{0,9}$/.test(String(v)) ? Number(v) : null);

// The body as a template: { name, content } or { code }. The name is trimmed; the text is kept as typed.
function templateOf(body) {
  const b = body && typeof body === 'object' ? body : {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > MAX_NAME) return { code: 'name' };
  if (typeof b.content !== 'string' || !b.content.trim() || b.content.length > MAX_CONTENT) return { code: 'content' };
  return { name, key: name.toLowerCase(), content: b.content };
}
async function nameTaken(wid, key, exceptId = 0) {
  const { rows } = await pool.query('SELECT id FROM note_templates WHERE workspace_id = $1 AND name_key = $2 AND id <> $3', [wid, key, exceptId]);
  return rows.length > 0;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM note_templates WHERE workspace_id = $1 ORDER BY name_key, id`, [req.workspaceId]);
    res.json({ templates: rows, max: MAX_TEMPLATES });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const t = templateOf(req.body);
    if (t.code) return refuse(res, t.code);
    const { rows: [count] } = await pool.query('SELECT COUNT(*)::int AS n FROM note_templates WHERE workspace_id = $1', [req.workspaceId]);
    if (count.n >= MAX_TEMPLATES) return refuse(res, 'limit');
    if (await nameTaken(req.workspaceId, t.key)) return refuse(res, 'name_taken');
    const { rows: [row] } = await pool.query(
      `INSERT INTO note_templates (workspace_id, name, name_key, content, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLUMNS}`,
      [req.workspaceId, t.name, t.key, t.content, req.userId]
    );
    res.status(201).json({ template: row });
  } catch (err) {
    if (err && err.code === '23505') return refuse(res, 'name_taken');   // two people added the same name at once: the index decided
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    if (!id) return refuse(res, 'not_found');
    const t = templateOf(req.body);
    if (t.code) return refuse(res, t.code);
    if (await nameTaken(req.workspaceId, t.key, id)) return refuse(res, 'name_taken');
    const { rows: [row] } = await pool.query(
      `UPDATE note_templates SET name = $3, name_key = $4, content = $5, updated_at = NOW() WHERE id = $1 AND workspace_id = $2 RETURNING ${COLUMNS}`,
      [id, req.workspaceId, t.name, t.key, t.content]
    );
    if (!row) return refuse(res, 'not_found');
    res.json({ template: row });
  } catch (err) {
    if (err && err.code === '23505') return refuse(res, 'name_taken');
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    if (!id) return refuse(res, 'not_found');
    const { rowCount } = await pool.query('DELETE FROM note_templates WHERE id = $1 AND workspace_id = $2', [id, req.workspaceId]);
    if (!rowCount) return refuse(res, 'not_found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
