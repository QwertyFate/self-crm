/* ═══════════════════════════════════════════════════════════════════════════
   /api/fields — the custom fields of CONTACTS (and suppliers).

   One line of real code: the CRUD is middleware/field-crud.js, shared with the
   other three field routers (deal-fields, task-fields, object-fields).
   Edit the behaviour there, not here.

   The definitions live in the `custom_fields` table; the VALUES live in each
   contact's custom_data JSONB under field_key.

   GET / · POST / · PUT /:id · DELETE /:id   (all workspace-scoped)
   ═══════════════════════════════════════════════════════════════════════════ */

const { createFieldRouter } = require('../middleware/field-crud');

module.exports = createFieldRouter('custom_fields');
