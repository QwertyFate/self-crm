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
