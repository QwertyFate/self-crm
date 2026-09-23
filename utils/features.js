const { pool } = require('../db');

// Platform-wide feature flags live in platform_settings under the key "features".
// Anything missing falls back to these defaults, so an absent row = feature off.
const DEFAULT_FEATURES = { tourEnabled: false };

async function readFeatures() {
  const { rows } = await pool.query('SELECT value FROM platform_settings WHERE key=$1', ['features']);
  return { ...DEFAULT_FEATURES, ...(rows[0]?.value || {}) };
}

async function writeFeatures(patch) {
  const next = { ...(await readFeatures()), ...patch };
  await pool.query(
    'INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
    ['features', JSON.stringify(next)]
  );
  return next;
}

module.exports = { DEFAULT_FEATURES, readFeatures, writeFeatures };
