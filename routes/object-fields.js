/* ═══════════════════════════════════════════════════════════════════════════
   /api/object-fields — the custom fields of LISTINGS / objects.

   One line of real code: the CRUD is middleware/field-crud.js, shared with the
   other three field routers (fields, deal-fields, task-fields).
   Edit the behaviour there, not here.

   The definitions live in the `object_fields` table; the VALUES live in each
   object's custom_data JSONB under field_key.

   GET / · POST / · PUT /:id · DELETE /:id   (all workspace-scoped)
   ═══════════════════════════════════════════════════════════════════════════ */

const { createFieldRouter } = require('../middleware/field-crud');

module.exports = createFieldRouter('object_fields');
