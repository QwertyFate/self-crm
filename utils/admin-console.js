/**
 * Resolves ADMIN_CONSOLE_PATH from the environment.
 *
 * The platform admin console (page + API) is mounted only under this path,
 * so nothing admin-related exists at a guessable URL. Unset means the console
 * is disabled entirely. A malformed value is a boot-time error, never a
 * silent fallback.
 *
 * Rules: one path segment — a leading "/" followed by 16–128 characters from
 * A–Z, a–z, 0–9, "_" or "-". No trailing slash, no nested segments, no query.
 * The minimum length rules out /admin, /adminconsole and similar.
 */
const PATH_RE = /^\/[A-Za-z0-9_-]{16,128}$/;

function resolveAdminConsolePath(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const value = String(raw).trim();
  if (!PATH_RE.test(value)) {
    throw new Error(
      'ADMIN_CONSOLE_PATH must be a single path segment: a leading "/" followed by ' +
      '16–128 characters from A–Z, a–z, 0–9, "_" or "-" (no trailing slash, no nested ' +
      'segments). Generate one with:\n' +
      '  node -e "console.log(\'/\' + require(\'crypto\').randomBytes(16).toString(\'hex\'))"'
    );
  }
  return value;
}

module.exports = { resolveAdminConsolePath };
