/* ═══════════════════════════════════════════════════════════════════════════
   ENGINE CONTROLS — the platform administrator's two switches for the Upgrads
   Engine integration, one JSON blob in platform_settings under "engine_controls".

     api_enabled       false → every call to /api/kunden and /api/dokumente answers
                       503 api_deaktiviert (middleware/engine-gate.js). Keys stay
                       valid; nothing is deleted.
     webhooks_enabled  false → outgoing events are still recorded in engine_deliveries
                       but not sent; they wait (postponed hourly) and go out when the
                       switch is turned on again (utils/engine.js).

   Read on EVERY Engine request, so the value is cached for CACHE_MS; the admin
   console writes through writeControls(), which refreshes the cache in this
   process at once (a second instance sees it within CACHE_MS). A failing read
   never takes the Engine down by itself: it answers the defaults (both on) and
   logs — the request's own queries will fail on the same outage anyway.
   ═══════════════════════════════════════════════════════════════════════════ */
const { pool } = require('../db');

const KEY      = 'engine_controls';
const DEFAULTS = { api_enabled: true, webhooks_enabled: true };
const CACHE_MS = 10_000;

let cache = { at: 0, value: null };

async function readControls({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const { rows } = await pool.query('SELECT value FROM platform_settings WHERE key=$1', [KEY]);
    const value = { ...DEFAULTS, ...(rows[0] && rows[0].value && typeof rows[0].value === 'object' ? rows[0].value : {}) };
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error('engine controls read failed:', e && e.message ? e.message : e);
    return { ...DEFAULTS };
  }
}

// Only the two known booleans are accepted; anything else is a caller error.
function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'Body must be an object';
  const keys = Object.keys(patch);
  if (!keys.length) return 'No switch provided';
  for (const k of keys) {
    if (!(k in DEFAULTS)) return `Unknown switch: ${k}`;
    if (typeof patch[k] !== 'boolean') return `${k} must be a boolean`;
  }
  return null;
}

async function writeControls(patch) {
  const problem = validatePatch(patch);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  const next = { ...(await readControls({ fresh: true })), ...patch };
  await pool.query(
    'INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
    [KEY, JSON.stringify(next)]
  );
  cache = { at: Date.now(), value: next };
  return next;
}

function resetCache() { cache = { at: 0, value: null }; }

module.exports = { KEY, DEFAULTS, CACHE_MS, readControls, writeControls, validatePatch, resetCache };
