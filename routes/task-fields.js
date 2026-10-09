/* ═══════════════════════════════════════════════════════════════════════════
   /api/task-fields — the custom fields of TASKS.

   One line of real code: the CRUD is middleware/field-crud.js, shared with the
   other three field routers (fields, deal-fields, object-fields).
   Edit the behaviour there, not here.

   The definitions live in the `task_fields` table; the VALUES live in each
   task's custom_data JSONB under field_key.

   GET / · POST / · PUT /:id · DELETE /:id   (all workspace-scoped)
   ═══════════════════════════════════════════════════════════════════════════ */

const { createFieldRouter } = require('../middleware/field-crud');

module.exports = createFieldRouter('task_fields');
