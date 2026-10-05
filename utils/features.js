/* ═══════════════════════════════════════════════════════════════════════════
   PLATFORM FEATURE FLAGS — one JSON blob in platform_settings, key "features".

   Platform-wide, not per workspace: these are switches the people running the
   platform control from the admin console, not workspace settings.

   DEFAULT_FEATURES is the source of truth for which flags exist and what they
   are when unset — a missing row means every flag is at its default, which for
   tourEnabled is OFF. readFeatures() always merges over the defaults, so a
   flag added here works immediately against an old row.

   Read by: routes/platform.js (any logged-in user, so the client can tell
   whether the product tour exists) and routes/admin.js (the console that
   writes them).
   ═══════════════════════════════════════════════════════════════════════════ */

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
