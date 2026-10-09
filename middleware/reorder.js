/* ═══════════════════════════════════════════════════════════════════════════
   reorderItems(table, idCol, ids, whereClause, whereParams)

   Shared "the user dragged things into this order" helper. It walks the id
   array and writes position = index for each row, all inside ONE transaction,
   so a half-applied order can never be left behind.

   The caller supplies the extra WHERE clause and its parameters, which is how
   the workspace filter gets in — see routes/pipelines.js:
     reorderItems('pipeline_stages', 'id', ids,
                  'pipeline_id=$3 AND workspace_id=$4', [pipelineId, workspaceId])
   Note the parameter numbering: $1 is the position, $2 the id, and the
   caller's own placeholders therefore start at $3.

   `table`, `idCol` and `whereClause` are interpolated into the SQL, so they
   must always be literals written by us — never request data.
   ═══════════════════════════════════════════════════════════════════════════ */

const { pool } = require('../db');

async function reorderItems(table, itemIdCol, ids, whereClause, whereParams) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      const query = `UPDATE ${table} SET position=$1 WHERE ${itemIdCol}=$2 AND ${whereClause}`;
      await client.query(query, [i, ids[i], ...whereParams]);
    }
    await client.query('COMMIT');
    return { success: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { reorderItems };
