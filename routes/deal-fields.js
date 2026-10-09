/* ═══════════════════════════════════════════════════════════════════════════
   /api/deal-fields — the custom fields of DEALS.

   One line of real code: the CRUD is middleware/field-crud.js, shared with the
   other three field routers (fields, task-fields, object-fields).
   Edit the behaviour there, not here.

   The definitions live in the `deal_fields` table; the VALUES live in each
   deal's custom_data JSONB under field_key.

   GET / · POST / · PUT /:id · DELETE /:id   (all workspace-scoped)
   ═══════════════════════════════════════════════════════════════════════════ */

const { createFieldRouter } = require('../middleware/field-crud');

module.exports = createFieldRouter('deal_fields');
