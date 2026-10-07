// UNIT: the login rate limit counts only FAILED attempts.
//
// WHY. It was 5 requests per 15 minutes per IP, successful logins included —
// so anyone who logged in a few times (testing, switching workspaces,
// several people behind one office IP before trust-proxy) got the 6th
// attempt refused with "Too many login attempts", which on the login page
// looks exactly like "my password is right but the button does nothing".
// Brute-force protection only needs to count wrong guesses.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');

describe('server.js loginLimiter', () => {
  const src = read('server.js');
  const block = src.slice(src.indexOf('const loginLimiter = rateLimit({'), src.indexOf('const signupLimiter'));
  test('skips successful requests, so a correct password never spends an attempt', () => {
    assert.match(block, /skipSuccessfulRequests:\s*true/);
  });
  test('allows ten wrong guesses per 15 minutes per IP, and trust proxy is on so the IP is the user\'s, not the tunnel\'s', () => {
    assert.match(block, /windowMs:\s*15 \* 60 \* 1000/); assert.match(block, /max:\s*10/);
    assert.match(src, /app\.set\('trust proxy', 1\)/);
  });
  test('is still mounted on the login route only', () => {
    assert.match(src, /app\.use\('\/api\/auth\/login',\s*loginLimiter\)/);
    assert.equal(src.split('loginLimiter').length - 1, 2);
  });
});
