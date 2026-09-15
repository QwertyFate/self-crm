# Admin console security fix — change log

**Branch:** `securityfixes`
**Files edited:** 2 (`routes/admin.js`, `server.js`)
**Net:** +51 / −9
**Committed:** no. All changes are in the working tree.

Fixes session fixation on admin login, adds a rate limit to `/api/admin/login`, and makes the `ADMIN_SECRET` comparison constant-time.

---

## Files edited

| File | Lines added | What changed |
|---|---|---|
| `routes/admin.js` | 5, 7–18, 29–45 | Import helper, add `safeEqual`, rewrite the login handler |
| `server.js` | 52–56, 102 | Define `adminLimiter`, mount it on `/api/admin/login` |

No other file was touched. `routes/auth.js`, `utils/session.js`, the session cookie settings, `trust proxy`, startup logic, and every other route are unchanged.

---

## 1. `routes/admin.js`

### Line 5 — import the existing helper

```js
const { regenerateSession } = require('../utils/session');
```

Reuses the promisified helper already in `utils/session.js:9`, imported the same way as `routes/auth.js:7`. No new module was written.

### Lines 7–18 — constant-time comparison (new function)

```js
/**
 * Constant-time secret comparison.
 *
 * Both sides are hashed to a fixed 32 bytes first so timingSafeEqual never
 * sees mismatched lengths — it throws on unequal buffers, which would turn a
 * wrong-length guess into a 500 and leak the secret's length via status code.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}
```

`crypto` was already imported at line 3; no new dependency.

### Lines 29–45 — login handler rewritten

Was (lines 15–22 before the edit):

```js
router.post('/login', (req, res) => {
  const { secret } = req.body;
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return res.status(503).json({ error: 'ADMIN_SECRET is not configured on this server.' });
  if (!secret || secret !== adminSecret) return res.status(401).json({ error: 'Invalid admin secret.' });
  req.session.isAdmin = true;
  res.json({ success: true });
});
```

Now:

```js
router.post('/login', async (req, res, next) => {
  try {
    const { secret } = req.body;
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return res.status(503).json({ error: 'ADMIN_SECRET is not configured on this server.' });
    if (!secret || !safeEqual(secret, adminSecret)) {
      return res.status(401).json({ error: 'Invalid admin secret.' });
    }

    // Issue a new session ID *after* authenticating, so a session ID an
    // attacker planted in the operator's browser can never be upgraded into
    // an admin session. Same pattern as the user login in routes/auth.js.
    await regenerateSession(req);
    req.session.isAdmin = true;
    res.json({ success: true });
  } catch (e) { next(e); }
});
```

Four changes: `async (req, res, next)`, a `try/catch` routing failures to the error middleware, `safeEqual` in place of `!==`, and `await regenerateSession(req)` before `isAdmin` is set.

Response bodies are byte-identical to before — `{ success: true }` on success, `{ error: 'Invalid admin secret.' }` on 401, `{ error: 'ADMIN_SECRET is not configured on this server.' }` on 503.

---

## 2. `server.js`

### Lines 52–56 — limiter definition

```js
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Too many admin login attempts. Please try again in 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
});
```

Same shape as `loginLimiter` at lines 47–51, with a 15-minute window and 10 attempts.

### Line 102 — mount

```js
app.use('/api/auth/login',           loginLimiter);
app.use('/api/admin/login',          adminLimiter);   // <- added
app.use('/api/auth/signup',          signupLimiter);
```

Sits at line 102, above the admin router at line 108, so it runs first.

> **Note on the rest of the `server.js` diff.** `git diff server.js` also shows the `SESSION_SECRET` boot guard (lines 15–27) and `secure: 'auto'` on the session cookie. Those were already in your working tree before this task and were not made or modified here.

---

## Verification

A throwaway harness mounted the real `routes/admin.js` plus the limiter on an ephemeral port with an in-memory session store. No database, no `.env`, port 3000 untouched, the app never started. `ADMIN_SECRET` was generated inside the harness and never printed; session IDs are reported only as 8-character SHA-256 fingerprints.

The same harness was run against the **unmodified** file first, so the failures are real rather than the tests being vacuous.

| # | Assertion | Before | After |
|---|---|---|---|
| 1 | Login response rotates the session ID | **FAIL** | ok |
| 2 | Planted session does not become admin | **FAIL** | ok |
| 3 | New session is admin, flow works end to end | ok | ok |
| 4 | Wrong secret → 401, message unchanged | ok | ok |
| 5 | Length-mismatched guess → 401, not 500 | ok | ok |
| 6 | Unset `ADMIN_SECRET` → 503 | ok | ok |
| 7 | 11 attempts → 10×401 then 429 | ok | ok |

Baseline run, unmodified code:

```
FAIL  1. login response rotates the session ID  — planted=4759a3da after-login=4759a3da
FAIL  2. planted session did NOT become admin   — isAdmin=true (was false before login)
5/7 passed — failing: 1, 2
```

That is the vulnerability reproduced: the planted session keeps its ID through login, and `isAdmin` flips from `false` to `true` on it.

After the fix:

```
ok  1. login response rotates the session ID  — planted=ff3848ce after-login=18d5c1eb
ok  2. planted session did NOT become admin   — isAdmin=false (was false before login)
7/7 passed
```

Tests 3–7 passing in both columns is the point: the fix closes the hole without changing any response the two admin UIs depend on.

**Test 7 caveat.** The harness mounts its own copy of the limiter, so test 7 validates the limiter's configuration, not that `server.js` wires it. That wiring was checked separately by parsing `server.js`:

```
adminLimiter defined at line : 52
limiter mounted at line      : 102
admin router mounted at line : 108
PASS: limiter is defined and mounted BEFORE the admin router
```

`node --check` passes on both edited files.

---

## Behaviour change to expect

Regenerating the session destroys it, so **logging into the admin console now also logs you out of the CRM in that browser** (`userId`, `workspaceId`, `userRole` are cleared). This was a deliberate choice: an admin session should not carry a workspace identity. The SPA admin panel at `/?admin` shares the CRM cookie, so you will hit this during normal use.

Both admin UIs still work. Each awaits the login response before firing follow-up calls, and the new `Set-Cookie` rides on that response, which test 1 asserts directly.

---

## Not done — flagged only

- **`POST /api/admin/logout`** (`routes/admin.js:47`) sets `req.session.isAdmin = false` but leaves the session alive. `req.session.destroy()` would be stronger. Left alone per the instruction not to touch other routes.
- **`ADMIN_SECRET` is 13 characters** in the current `.env`. The rate limiter narrows the brute-force window but does not fix a weak secret. Rotating it to 32+ bytes is worth doing:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **`public/app.js`** holds a dead duplicate of the admin frontend code and is referenced by no HTML file. It shows up in greps; it was not edited.

---
---

# Part 2 — Rate-limit bypass via `trust proxy`

## The concern, and what is actually true

The question raised: with `app.set('trust proxy', 1)`, a client can send its own `X-Forwarded-For` and the rate limiter keys on the fake address.

That is true, but only in one topology, and the same setting has a second, opposite failure that matters just as much. Express computes `req.ip` by walking the forwarding chain from the socket outward and trusting exactly *N* hops. `1` is only correct when there is exactly one proxy that appends the client address. The site is behind Cloudflare (confirmed: Cloudflare nameservers, Cloudflare A records, `server: cloudflare`, `cf-ray`). What sits between Cloudflare and Node is not visible from the repo, so I tested every realistic option with the exact function Express uses, `proxy-addr`:

| Topology | `trust proxy: 1` gives | CIDR list gives |
|---|---|---|
| Direct hit on the origin, client spoofs XFF | **the spoofed address** | real client |
| Cloudflare → `cloudflared` tunnel on localhost | real client | real client |
| Cloudflare → nginx on localhost (appends CF IP) | **Cloudflare's edge IP** | real client |
| Cloudflare → PaaS private load balancer (10.x) | **Cloudflare's edge IP** | real client |
| Cloudflare edge connects to the origin directly | real client | real client |

So `trust proxy: 1` is right in two of five setups. In the direct-hit case it is spoofable — your point. In the nginx and PaaS cases it collapses **every user** onto one Cloudflare IP, so any one attacker's ten guesses lock out every legitimate admin, and the user-login limiter at 5 / 15 min starts returning 429 to the whole company. A hop count cannot be made correct in both directions. An allow-list can.

## The fix — two layers

### Layer 1: `trust proxy` becomes a CIDR allow-list

**`utils/trusted-proxies.js`** (new) exports an array Express accepts directly: `loopback`, `linklocal`, `uniquelocal` (covers nginx, cloudflared, and every mainstream PaaS internal LB), plus Cloudflare's published IPv4 and IPv6 ranges, fetched 2026-09-15 from `cloudflare.com/ips`.

**`server.js:28–31`**

```js
// Trust X-Forwarded-* only from Cloudflare's edge and local/private hops.
// A hop count is wrong in both directions: too low collapses every user onto
// the proxy's IP, too high lets a direct hit on the origin spoof its own IP.
app.set('trust proxy', require('./utils/trusted-proxies'));
```

Was: `app.set('trust proxy', 1);`

Express now stops at the first address *not* in the list. A request that arrives straight from the internet has an untrusted socket address, so any `X-Forwarded-For` it carries is ignored and it cannot spoof itself. A request through Cloudflare resolves to the real client no matter how many trusted hops are in between.

This changes `req.ip` for **every** limiter (user login, signup, password reset, webhooks), and `req.secure` for the session cookie's `secure: 'auto'`. In every topology tested it is equal to or better than the hop count; there is no setup where `1` was right and the list is wrong.

### Layer 2: a global backstop that ignores IP

**`server.js:60–70`**

```js
// Backstop for the admin login that does not key on IP at all: one bucket for
// every source, counting failures only. An attacker rotating or spoofing IPs
// still gets at most 30 guesses per window. Headers are left to the per-IP
// limiter above so a legitimate client sees one consistent RateLimit-* set.
const adminGlobalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  keyGenerator: () => 'admin-login-global',
  skipSuccessfulRequests: true,
  message: { error: 'Too many admin login attempts. Please try again in 15 minutes.' },
  standardHeaders: false, legacyHeaders: false,
});
```

**`server.js:116`**

```js
app.use('/api/admin/login',          adminLimiter, adminGlobalLimiter);
```

This is the "second rate limiter" you suggested, made immune to the problem by construction: it keys on a constant, so there is no IP to spoof, rotate, or distribute across. A botnet, a Tor exit pool, or a stack of Cloudflare Workers gets 30 wrong guesses per 15 minutes total. Successful logins do not consume the budget. The per-IP limiter runs first, so a single noisy source is absorbed there and does not burn the global budget.

**Trade-off, accepted deliberately:** 30 failures from *anyone* lock the admin login for 15 minutes for *everyone*. For an endpoint used by one or two operators that is the right side of the trade — it is a loud, bounded signal of an attack rather than a silent brute force — but it is a denial-of-service lever. The number is easy to change if it bites.

## Verification

Harness ran against the unmodified code first.

**Before**

```
Part A — req.ip resolution by topology
  Direct hit on origin, client spoofs XFF               203.0.113.9    ✗
  Cloudflare -> nginx on localhost (appends CF IP)      104.16.1.1     ✗
  Cloudflare -> PaaS private LB (10.x)                  104.16.1.1     ✗
  FAIL  A1. trust proxy = 1 identifies the real client in every topology

Part B — HTTP, WITHOUT global backstop
  FAIL  B1. 40 guesses from 40 spoofed IPs are capped  — 40x401, never 429 — BYPASSED
```

**After**

```
Part A — req.ip resolution by topology              trust=1          trust=CIDR list
  Direct hit on origin, client spoofs XFF           203.0.113.9  ✗   198.51.100.7  ✓
  Cloudflare -> cloudflared tunnel (localhost)      198.51.100.7 ✓   198.51.100.7  ✓
  Cloudflare -> nginx on localhost (appends CF IP)  104.16.1.1   ✗   198.51.100.7  ✓
  Cloudflare -> PaaS private LB (10.x)              104.16.1.1   ✗   198.51.100.7  ✓
  Cloudflare edge connects to origin directly       198.51.100.7 ✓   198.51.100.7  ✓
  ok    A2. CIDR allow-list identifies the real client in every topology

Part B — HTTP, WITH global backstop
  ok    B1. 40 guesses from 40 spoofed IPs are capped  — first 429 at attempt 31; 30x401, 10x429
  ok    B2. correct secret after 5 failures still returns 200
```

Part A runs `proxy-addr` — the function behind `req.ip` — with the real `utils/trusted-proxies.js` module compiled exactly as Express compiles it. Part B mounts the real `routes/admin.js` on an ephemeral port and fires wrong-secret requests, each carrying a different spoofed `X-Forwarded-For`. No database, no `.env`, port 3000 untouched, the app never started, `ADMIN_SECRET` never printed.

Also confirmed: `node --check` on both files; the list compiles through `proxy-addr` (loopback and a Cloudflare address trusted, `8.8.8.8` not); and by parsing `server.js`, the trust list is set at line 31, both limiters are mounted at line 116, ahead of the admin router at line 122.

**What the harness cannot prove:** which of the five topologies is yours. The list covers all of them; the only way it is wrong is a hop with a *public, non-Cloudflare* address between Cloudflare and Node, which none of the mainstream hosts use.

## One-minute check after deploy

From two devices on different networks (laptop on Wi-Fi, phone on cellular), send one bad login each to `/api/auth/login` and compare the `RateLimit-Remaining` response header. Each should count down independently (`4` then `4`). If they share one countdown (`4` then `3`), a hop between Cloudflare and Node is not in the list — add its range to `utils/trusted-proxies.js`. That is the loud failure mode; there is no silent one.

## Still worth doing, not done here

- **Firewall the origin to Cloudflare's ranges.** The direct-hit topology should not be reachable at all. The code fix makes a direct hit unable to spoof its IP; the firewall makes it unable to connect. Both belong.
- **Refresh the Cloudflare list** when they announce a change (rare; `cloudflare.com/ips`). Stale entries fail loud, per the check above.

## Part 2 — files and lines

| File | Lines | What changed |
|---|---|---|
| `server.js` | 28–31 | `trust proxy` hop count → CIDR allow-list (was line 28, one line) |
| `server.js` | 60–70 | Define `adminGlobalLimiter` (all sources, 30 failures / 15 min) |
| `server.js` | 116 | Mount changed to `adminLimiter, adminGlobalLimiter` (was `adminLimiter` alone) |
| `utils/trusted-proxies.js` | new, 55 lines | Cloudflare edge ranges + loopback / link-local / private |

Part 2 inserted lines above Part 1's edits, so Part 1's `server.js` line numbers have shifted: `adminLimiter` is now at 54–58 (was 52–56) and the mount is now line 116 (was 102). `routes/admin.js` is unchanged since Part 1. Part 2 totals: `server.js` +19 / −1, plus the new file.

---
---

# Part 3 — Type confusion in the secret comparison

## The flaw (introduced in Part 1)

Part 1 replaced `secret !== adminSecret` with `safeEqual(secret, adminSecret)`, and `safeEqual` coerced both sides with `String()`. Strict inequality rejected anything that was not a string. Coercion does not: `String(['abc'])` is `'abc'`, so a JSON body of `{"secret": ["<the real secret>"]}` authenticated. Reproduced before the fix:

```
FAIL  T1. array wrapping the correct secret -> 401  — 200 {"success":true}
FAIL  T2. nested array wrapping the secret -> 401   — 200 {"success":true}
```

It is not a bypass — the caller still needs the secret — but the accepted input domain widened without anyone deciding it should, and an authentication primitive must never coerce. Numbers, objects, booleans and `null` were already rejected, because their `String()` forms cannot equal a 13+ character secret; arrays were the gap.

## The fix

Two edits, both in `routes/admin.js`, both rejecting non-strings before any comparison runs.

### Lines 7–24 — `safeEqual` no longer coerces

```js
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}
```

Was: `.update(String(a), 'utf8')` and `.update(String(b), 'utf8')` with no type guard. Doc comment updated to say why (lines 8–13).

Returning `false` rather than throwing keeps the function fail-closed: a wrong type can never produce a 500, and no future caller can reintroduce the coercion by passing something odd.

### Lines 40–43 — strict check in the handler

```js
// Strict type check first: only a non-empty string may reach the compare.
if (typeof secret !== 'string' || !secret || !safeEqual(secret, adminSecret)) {
  return res.status(401).json({ error: 'Invalid admin secret.' });
}
```

Was: `if (!secret || !safeEqual(secret, adminSecret)) {`. Same 401 body as before.

## Timing safety — preserved, and why the early return does not weaken it

Constant-time comparison exists to stop an attacker learning about the **secret** from how long a request takes. The `typeof` check and the empty-string check depend only on what the attacker sent, which they already know. They reveal nothing about `ADMIN_SECRET`. The only code path that touches the secret is unchanged: every string input, right or wrong, any length, goes through the same sha256-then-`timingSafeEqual` sequence. Rejecting a non-string early is therefore not a timing leak; it is the same class of early exit as the existing `!secret` guard, and as the `!adminSecret` 503 before it.

## Verification

Harness sends each non-string shape JSON can carry, plus a correct and a wrong string. Run against the unmodified file first.

| # | Payload for `secret` | Before | After |
|---|---|---|---|
| T1 | `["<real secret>"]` | **200 — authenticated** | 401 |
| T2 | `[["<real secret>"]]` | **200 — authenticated** | 401 |
| T3 | `123456` | 401 | 401 |
| T4 | `{"a":1}` | 401 | 401 |
| T5 | `true` | 401 | 401 |
| T6 | `null` | 401 | 401 |
| T7 | `["x","y"]` | 401 | 401 |
| T8 | correct string | 200 | 200 |
| T9 | wrong string | 401 | 401 |

Every 401 carries the unchanged body `{ "error": "Invalid admin secret." }`.

The Part 1 harness was re-run as a regression check — session rotation, planted session not upgraded, 401 and 503 messages, length-mismatched guess still 401 not 500, limiter at 10 then 429 — 7/7. `node --check` passes.

No database, no `.env`, the app never started, `ADMIN_SECRET` never printed.

## Part 3 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/admin.js` | 7–18 | Doc comment on `safeEqual` rewritten to explain the strings-only rule |
| `routes/admin.js` | 20 | Added `typeof` guard returning `false` |
| `routes/admin.js` | 21–22 | `String(a)` / `String(b)` → `a` / `b` |
| `routes/admin.js` | 40–41 | Comment added; `typeof secret !== 'string' ||` prepended to the condition |

`safeEqual` now spans lines 19–24 (was 14–18 after Part 1); the login handler now begins at line 35 (was 29). `server.js` and `utils/trusted-proxies.js` are unchanged since Part 2. Part 3 totals: `routes/admin.js` +9 / −3.

---
---

# Part 4 — Admin logout destroys the session; limiter ordering tidied

## 1. Logout — `routes/admin.js:54–62`

### The flaw

`POST /api/admin/logout` set `req.session.isAdmin = false` and returned. The session record stayed in the store and the cookie in the browser kept resolving to it. Reproduced before the fix, with an inspectable in-memory store:

```
ok    L1. login -> 200 and one session in store          — sessions=1
ok    L2. logout -> 200 {success:true}
FAIL  L3. session record destroyed (store empty)         — sessions=1 — session still alive server-side
```

Admin rights were gone (L4 passed before and after), but the session itself was not. Part 1 flagged this as a follow-up.

### The fix

Was:

```js
router.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});
```

Now:

```js
router.post('/logout', (req, res, next) => {
  // Destroy the whole session rather than toggling a flag, so the session ID
  // in the browser stops resolving to anything server-side. Same pattern as
  // the user logout in routes/auth.js.
  req.session.destroy((err) => {
    if (err) return next(err);
    res.json({ success: true });
  });
});
```

Mirrors `routes/auth.js:329–331`, with a store error routed to the error middleware instead of swallowed. Response body unchanged. As with login in Part 1, destroying the session also clears any CRM login carried in the same cookie — consistent with the decision already taken there.

### Verification

| # | Assertion | Before | After |
|---|---|---|---|
| L1 | Login → 200, one session in store | ok | ok |
| L2 | Logout → 200 `{ success: true }` | ok | ok |
| L3 | Session record destroyed (store empty) | **FAIL** | ok |
| L4 | Old cookie no longer admin | ok | ok |
| L5 | Logout with no session → 200, not 500 | ok | ok |

## 2. Rate limiter ordering — `server.js`

Pure reorder, no behaviour change. The admin limiters had been inserted in the middle of the auth group in both the definitions block and the mount block. They now sit after it.

### Definitions (lines 50–86)

Order is now `loginLimiter` (50) → `signupLimiter` (55) → `passwordLimiter` (60) → `adminLimiter` (65) → `adminGlobalLimiter` (74) → `webhookIpLimiter` (81). Previously the two admin limiters were at 55–70, between login and signup.

### Mounts (lines 115–119)

```js
app.use('/api/auth/login',           loginLimiter);
app.use('/api/auth/signup',          signupLimiter);
app.use('/api/auth/forgot-password', passwordLimiter);
app.use('/api/auth/reset-password',  passwordLimiter);
app.use('/api/admin/login',          adminLimiter, adminGlobalLimiter);
```

The admin mount moved from line 116 (between login and signup) to line 119. It still precedes the admin router at line 122, which is the only ordering that matters; the five mounts match different path prefixes and are otherwise independent of one another.

### Verification

Order asserted by parsing `server.js`: definitions grouped auth → admin → webhook, mounts grouped auth → admin, all ahead of the router. Then every earlier harness re-run against the moved code:

- Part 1 (fixation, per-IP limiter, messages): 7/7
- Part 2 (trust list, global backstop, spoofed-IP cap): all assertions on the new code pass; the `trust proxy = 1` control column fails as designed
- Part 3 (type confusion): 9/9

`node --check` passes on both files.

## Part 4 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/admin.js` | 54–62 | Logout handler: `isAdmin = false` → `req.session.destroy` with error routing |
| `server.js` | 65–79 | `adminLimiter` and `adminGlobalLimiter` definitions moved here (were 55–70) |
| `server.js` | 119 | Admin limiter mount moved here (was 116) |

`safeEqual` and the login handler in `routes/admin.js` are unchanged since Part 3. `utils/trusted-proxies.js` is unchanged since Part 2. Part 4 totals: `routes/admin.js` +7 / −2; `server.js` is a net-zero move.

---
---

# Part 5 — Admin console moved to an env-configured secret path

## Goal and what it honestly buys

Requested: put the admin console behind a path read from `.env` so its existence is not public. Obscurity is a layer, not a control — the secret, the two rate limiters, the constant-time compare and the session handling from Parts 1–4 are the controls. What this part adds on top is that nothing admin-related answers at any guessable URL, so an attacker has to find the path before they can even start guessing the secret.

Before this part the console was not just discoverable but advertised: a visible **Admin** link in the CRM sidebar (`index.html:219`), help text telling users to visit `yoursite.com/?admin` (`index.html:1085`), a full admin panel inside the main SPA, and `public/admin.html` served by the static middleware at `/admin.html` regardless of any route. All of that is gone. Scope was confirmed as "hide everything" before work began.

## Changes

### `utils/admin-console.js` — new, 29 lines

`resolveAdminConsolePath(raw)`: unset or empty → `null` (console disabled); a valid single segment (`/` + 16–128 chars of `A–Z a–z 0–9 _ -`) → returned; anything else → throws with a generation command. The 16-character minimum rules out `/admin` and `/adminconsole` by construction.

### `server.js:28–37` — boot-time guard

```js
// Platform admin console path. Unset disables the console; malformed is fatal.
const { resolveAdminConsolePath } = require('./utils/admin-console');
let ADMIN_CONSOLE_PATH = null;
try {
  ADMIN_CONSOLE_PATH = resolveAdminConsolePath(process.env.ADMIN_CONSOLE_PATH);
} catch (e) {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
}
if (!ADMIN_CONSOLE_PATH) console.warn('ADMIN_CONSOLE_PATH is not set — the platform admin console is disabled.');
```

Same shape as the `SESSION_SECRET` guard directly above it.

### `server.js:155–162` — everything admin, mounted only when configured

```js
if (ADMIN_CONSOLE_PATH) {
  app.use(`${ADMIN_CONSOLE_PATH}/api/login`, adminLimiter, adminGlobalLimiter);
  app.use(`${ADMIN_CONSOLE_PATH}/api`,       require('./routes/admin'));
  app.get(ADMIN_CONSOLE_PATH, (req, res) => res.sendFile(path.join(__dirname, 'private', 'admin.html')));
}
```

Replaces three lines that were spread across the file: the limiter mount at 119 (`/api/admin/login`, placed there in Part 4), the router mount at 122 (`/api/admin`), and the page route at 146 (`/adminconsole`). Both limiters, the router and the page now sit together, under the same prefix, ahead of the SPA catch-all. The catch-all still returns `index.html` with 200 for any unknown path, so a wrong guess at the secret path is indistinguishable from any other URL — no 404 to enumerate against.

### `private/admin.html` — moved from `public/admin.html`; line 300 rewritten

`public/` is served whole by `express.static`, so the page was reachable at `/admin.html` no matter what route pointed at it. Moving it to `private/` closes that. Line 300:

```js
const API_BASE = location.pathname.replace(/\/+$/, '') + '/api';
```

Was `'/api/admin'`. The page derives its API base from its own URL, so it carries no knowledge of the path and needs no templating. Its absolute asset references (`/style.css`, `/images/logo.png`) are unaffected.

### `public/index.html` — SPA admin panel removed (1802 → 1754 lines)

- Admin screen block removed (was lines 29–72: the `ADMIN SCREEN` comment header and the whole `#admin-screen` div).
- Sidebar **Admin** link removed (was lines 218–220, `.admin-link-row`).
- Help text at what is now line 1037 (was 1085): `Get a code from the admin panel (yoursite.com/?admin)` → `Ask your platform administrator for a code.`
- The `js/admin-import.js` script tag is **kept** — see the deviation note below.

### `public/js/auth.js` — `?admin` branch removed (was lines 5–13)

`init()` now goes straight from reading `params` to the `/api/auth/me` call. `params` is still used for `reset`.

### `public/js/admin-import.js` — six admin functions removed (296 → 250 lines)

`handleAdminLogin`, `adminLogout`, `loadAdminInvites`, `adminGenerateCode`, `adminDeleteCode`, `adminCopyCode` (were lines 1–46). Everything from `exportContactsCSV` onward is untouched.

### `.env.example:7–13` — comment rewritten, new key documented

The old comment told people the panel was at `/?admin`. Replaced with generation commands for both values. `ADMIN_SECRET` placeholder changed from `change-me-to-something-secret` to empty — a value that looks like a secret and boots is worse than one that fails the guard — and `ADMIN_CONSOLE_PATH=` added.

### `.env` — `ADMIN_CONSOLE_PATH` appended

A freshly generated 32-hex-character path. The value is not recorded here; read it from the `ADMIN_CONSOLE_PATH` line in `.env`. Your console is at `https://qwertyfaythe.site` followed by that value.

## Deviation from the approved preview

The preview said the `admin-import.js` script tag would be removed. It was not, and the file was not deleted, because `admin-import.js` also holds the CSV contact **import and export** (`openImportModal`, `runImport`, `parseCSV`, `exportContactsCSV`, …) that `index.html` calls from the main app. Removing the tag would have broken contact import. Only the six admin functions were stripped; the tag stays. Harness check C7 asserts the tag is still present and C4 asserts the import code survived.

## Verification

New harness, 26/26. Part A runs the validator's edge cases. Part B mirrors the real `server.js` layout — `express.static(public)`, the guarded block, the SPA catch-all — on an ephemeral port with a generated path:

| # | Assertion |
|---|---|
| B1 | `GET /admin.html` no longer serves the console (static leak closed) |
| B2 | `GET /adminconsole` is just the SPA fallback |
| B3 | `POST /api/admin/login` is dead — 404, no JSON |
| B4 / B5 | `GET <path>` and `GET <path>/` serve the console page |
| B6 | `GET <path>/api/me` → `{ isAdmin: false }` |
| B7 / B8 | `POST <path>/api/login` → 401 on wrong secret, 200 on correct |
| B9 | Limiters are mounted at the new prefix — 429 appears |
| B10 / B11 | With the path unset, nothing admin answers anywhere |

Part C reads the files and asserts no `?admin`, `admin-screen`, `admin-link`, `/api/admin` or `/adminconsole` remains in `index.html`, `auth.js`, `admin-import.js` or `server.js`; that `public/admin.html` is gone and `private/admin.html` exists; and that the import/export code and its script tag survived.

Regression: Part 1 harness 7/7, Part 2 all new-code assertions pass, Part 3 9/9, Part 4 5/5. `node --check` on `server.js`, `utils/admin-console.js`, `public/js/auth.js`, `public/js/admin-import.js`. Wiring asserted by parsing `server.js`: guard at 28–37, limiters → router → page at 159–161 inside the `if`, catch-all at 164, zero occurrences of the old path literals.

No database, no `.env` read for values, the app never started, no secret or path printed.

**What the harness cannot prove:** the real boot with your `.env`. Start the app; you should see no `ADMIN_CONSOLE_PATH is not set` warning, `/adminconsole` should show the ordinary CRM, and the value from `.env` should show the console.

## Left alone, flagged

- **`public/app.js`** is a dead legacy bundle (referenced by no HTML) that still contains the old admin panel code and `/api/admin` strings, and `express.static` still serves it at `/app.js`. Those paths are dead now, but the file tells anyone who fetches it that a console once existed. Deleting it is a one-line `git rm`; it is your file and your call.
- **`public/style.css`** keeps three now-unused selectors (`.admin-link-row`, `#admin-screen`, `.admin-view-*`). Harmless dead CSS.
- **`ADMIN_SECRET` is still 13 characters.** Fourth time flagged. The path hides the door; the secret is still the lock.

## Part 5 — files and lines

| File | Lines | What changed |
|---|---|---|
| `utils/admin-console.js` | new, 29 | Path validator; unset → disabled, malformed → throws |
| `server.js` | 28–37 | Boot guard reading `ADMIN_CONSOLE_PATH` |
| `server.js` | 155–162 | Guarded block: limiters, router, page under the secret path |
| `server.js` | (removed) | Old mounts at 119 (`/api/admin/login`), 122 (`/api/admin`), 146 (`/adminconsole`) |
| `private/admin.html` | moved; 300 | From `public/admin.html`; `API_BASE` derived from `location.pathname` |
| `public/index.html` | (removed) 29–72, 218–220; 1037 | Admin screen, sidebar link removed; help text reworded |
| `public/js/auth.js` | (removed) 5–13 | `?admin` branch |
| `public/js/admin-import.js` | (removed) 1–46 | Six admin functions; import/export kept |
| `.env.example` | 7–13 | Comment rewritten; `ADMIN_SECRET` emptied; `ADMIN_CONSOLE_PATH` added |
| `.env` | appended | `ADMIN_CONSOLE_PATH=<generated>` |

Part 4's `server.js` line references have shifted again: the `adminLimiter` / `adminGlobalLimiter` definitions are now at 76–90 and their only mount is line 159. `routes/admin.js` is unchanged since Part 4.

---
---

# Part 6 — Platform invite-code panel restored, inside the secret console

## The regression this fixes

Part 5 removed the `/?admin` panel from the SPA. That panel was the **only** UI for platform invite codes — the standalone console page never had one (`grep -ci invite private/admin.html` → 0). So after Part 5 there was no way to generate a code for a new workspace. That was a functional regression introduced by Part 5 and missed at the time; the check that would have caught it ("does the surviving console cover every feature of the removed one?") was not done.

## Decision

Two options were considered: a fixed route such as `/adminCodepanel`, or a section inside the existing secret console. **Chosen: inside the console.** No new route, no new page, no change to `routes/admin.js` or `server.js`. The `/invites` endpoints were already mounted under the secret prefix via the full router; the page simply did not call them. A fixed path would have put an admin login back at a guessable URL, undoing Part 5 for this function. An initial attempt to split the router for a fixed path was rejected before any of it landed; `routes/admin.js` is byte-identical to its Part 4 state (harness check A8).

## Change — `private/admin.html` only (647 → 733 lines)

### Lines 242–252 — new section, placed between the stats grid and "Default Contact Columns"

```html
<!-- Platform Invite Codes -->
<div class="section">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <div>
      <h2 style="margin: 0 0 4px 0;">Platform Invite Codes</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 0;">One-time codes that allow someone to create a new workspace on signup</p>
    </div>
    <button class="btn btn-primary" onclick="generateInvite()">+ Generate</button>
  </div>
  <div id="invites-list" class="admin-invites-list"></div>
</div>
```

Same `.section` / header pattern as the two sections below it. Row styling reuses the `.admin-invite-*` and `.admin-badge` classes that already exist in `public/style.css` (the page loads it at line 7); they survived Part 5 because only markup was removed, not CSS.

### Line 374 — `loadDashboard()` now also calls `loadInvites()`

Fired first, outside the stats/defaults `try`, so an invites failure renders its own message in its own section and cannot blank the rest of the dashboard.

### Lines 649–720 — five functions and two helpers

- `esc()` and `fmtDate()` — the page had neither; copied from `public/js/core.js:194` and `:199` so behaviour matches the rest of the app.
- `loadInvites()` — `GET ${API_BASE}/invites`. Renders the list, "No invite codes yet" when empty, and the server's error text when the response is not OK or not an array (a 401 after session expiry shows as text rather than an empty-looking list, which is the silent-failure mode the old SPA panel had).
- `generateInvite()` — `POST`; on success reloads the list and uses the page's existing `showMessage()`.
- `deleteInvite(id)` — `confirm()` then `DELETE ${API_BASE}/invites/${id}`; the id is coerced with `Number()` where it is interpolated into the `onclick`.
- `copyInvite(code, btn)` — clipboard write with the ✓ feedback the old panel had.

Both `inv.code` and `inv.used_by_workspace_name` pass through `esc()` before rendering; the old panel rendered the code raw.

Every fetch goes through `API_BASE`, which the page derives from its own URL (Part 5), so the panel inherits the secret prefix with no path knowledge of its own.

## Verification

New harness, 12/12. Part A reads the files and asserts: the section and its button exist; all four functions and both helpers are defined; `loadDashboard()` calls `loadInvites()`; exactly three fetches target `${API_BASE}/invites` and none target a hardcoded `/api/admin`; code and workspace name are escaped; `server.js` contains no `adminCodepanel` or extra mount; `routes/admin.js` contains none of the rejected restructuring and still ends with `module.exports = router;`. Part B mounts the real router under a generated secret prefix and confirms the page is served with the section and that `GET`, `POST` and `DELETE` on `/invites` answer 401 JSON without a session — mounted and guarded, and never reaching the database.

Regression: Parts 1–5 harnesses all pass (7/7, Part 2 new-code assertions, 9/9, 5/5, 26/26). The page's inline `<script>` was extracted and passed `node --check`.

**Not proven here:** a logged-in round trip that actually inserts and deletes a `platform_invites` row — that needs the database and the running app. Log in at the secret path; the new section sits directly under the stats cards.

## Part 6 — files and lines

| File | Lines | What changed |
|---|---|---|
| `private/admin.html` | 242–252 | Invite-codes section markup |
| `private/admin.html` | 374 | `loadDashboard()` calls `loadInvites()` |
| `private/admin.html` | 649–720 | `esc`, `fmtDate`, `loadInvites`, `generateInvite`, `deleteInvite`, `copyInvite` |

`server.js`, `routes/admin.js`, `utils/*`, `public/*` and both env files are unchanged since Part 5. Part 6 totals: `private/admin.html` +86 / −0.

---
---

# Part 7 — Chat socket handler: per-user rate limit

## The problem

`socket.on('chat_message')` ran two `pool.query` calls per message with no throttle. One authenticated user emitting a burst of 100 messages issued 200 pool round-trips and starved the connection pool for every other request in the process. The HTTP limiters from earlier parts never see socket traffic.

Reproduced before the fix — 20 emits from one client inside one second:

```
burst: 20 emits in 824 ms; server accepted=20; client got new_message=20 chat_rate_limited=0
FAIL  S1. exactly 6 messages accepted            — got 20
FAIL  S3. no DB write for a rejected message     — accepted=20
```

## The fix

### `utils/chat-rate-limit.js` — new, 57 lines

`createChatRateLimiter({ windowMs, max, sweepMs, now })` → `{ check(userId), sweep(), size(), stop() }`.

- **Keyed by user id, never socket id.** Several tabs share one bucket, and a disconnect/reconnect does not reset it — the `disconnect` handler is deliberately untouched (harness confirms zero `chatLimiter` references inside it), because resetting there would be a trivial bypass.
- **Sliding window of timestamps.** `Map<userId, number[]>`, each array capped at `max` entries, expired stamps pruned on every check. `check()` returns `{ allowed: true, remaining }` or `{ allowed: false, retryAfterMs }`.
- **Automatic cleanup.** `setInterval(sweep, 60_000).unref()` removes any user whose stamps have all left the window. `unref()` means the timer never keeps the process alive. Memory is bounded by (users active in the last 10 s) × 6 numbers; 1,000 rapid checks from one user leave that user's array at 6 entries.
- `now` is injectable so the unit test drives the clock deterministically.

### `server.js:178–183` — require and instantiate, beside the `presence` map

```js
const { createChatRateLimiter } = require('./utils/chat-rate-limit');

// Per-user chat throttle: 6 messages per 10 s, keyed by user id (not socket
// id) so multiple tabs share one bucket and reconnecting does not reset it.
const CHAT_LIMIT  = { windowMs: 10_000, max: 6 };
const chatLimiter = createChatRateLimiter(CHAT_LIMIT);
```

### `server.js:221–231` — guard as the first statement of the handler

```js
socket.on('chat_message', async (content) => {
  // Bucket check first — before validation and before any pool query — so a
  // spamming user costs nothing beyond this Map lookup.
  const verdict = chatLimiter.check(userId);
  if (!verdict.allowed) {
    socket.emit('chat_rate_limited', {
      retryAfterMs: verdict.retryAfterMs,
      limit:        CHAT_LIMIT.max,
      windowMs:     CHAT_LIMIT.windowMs,
    });
    return;
  }
  if (!content?.trim() || content.length > 2000) return;   // unchanged from here on
```

Event name follows the handler's existing snake_case. Nothing after the guard changed.

## Verification

**Unit, 10/10** (`chat-ratelimit-test.js`, injected clock): 6 allowed with `remaining` 5→0, 7th denied with `retryAfterMs` 10 000; still denied at t=4 s with 6 000; allowed again at t=10 s; separate users have separate buckets; sweep empties the map once every stamp is outside the window and keeps a user whose stamps are still inside it; 1 000 rapid checks stay capped.

**Socket, 8/8** (`chat-spam-test.js`, the script you asked for). A throwaway socket.io server runs the real module and a handler mirroring the guard, with the two `pool.query` calls replaced by an `accepted` counter. A `socket.io-client` connects and fires 20 emits in one second (40 ms apart). `socket.io-client` was installed into the **scratchpad**, not the project; `package.json` and the lockfile are clean.

| # | Assertion | Result |
|---|---|---|
| S0 | 20 emits inside one second | 829 ms |
| S1 | Exactly 6 `new_message` | 6 |
| S2 | Exactly 14 `chat_rate_limited` | 14 |
| S3 | No DB write for a rejected message (`accepted` = 6) | 6 |
| S4 | First rejection arrives **during** the burst | at +291 ms; last emit at +829 ms |
| S5 | 7th emit → `chat_rate_limited` latency | **1.5 ms** |
| S6 | Every payload carries `limit`, `windowMs`, `retryAfterMs` | `{ retryAfterMs: 9751, limit: 6, windowMs: 10000 }` |
| S7 | All 14 rejections answered within 50 ms | max 2.3 ms |

The baseline run with the guard disabled fails S1–S4 (20 accepted, 0 limited), so the test detects the limiter's absence rather than passing vacuously.

**Wiring**, by parsing `server.js`: require at 178, instantiate at 183, and inside the handler the order is `chatLimiter.check` (223) → `emit` (225) → `return` (230) → content validation (232) → first `pool.query` (234). Disconnect handler at 253, unchanged. `node --check` on both files. All six earlier harnesses re-run green.

**Not proven here:** the real handler against the real app, with session auth and Postgres. The guard is the same six lines the harness mirrors, above code that did not change.

## Flagged, not done

- **`POST /api/chat/messages` in `routes/chat.js:45`** writes the same two rows over HTTP and is still unlimited. `createChatRateLimiter` can be reused there as an Express middleware keyed on `req.userId`; not part of this change.
- **The client ignores `chat_rate_limited`.** `public/js/chat.js` listens for `connect`, `connect_error`, `online_users`, `new_message` only. A throttled sender sees their message silently not appear. A listener showing a short notice would be the follow-up.

## Part 7 — files and lines

| File | Lines | What changed |
|---|---|---|
| `utils/chat-rate-limit.js` | new, 57 | Sliding-window per-user limiter with unref'd sweep |
| `server.js` | 178–183 | Require, `CHAT_LIMIT`, `chatLimiter` |
| `server.js` | 221–231 | Bucket check, `chat_rate_limited` emit, early return |

Everything else is unchanged since Part 6. Part 7 totals: `server.js` +17 / −0, plus the new file.

---
---

# Part 8 — Chat client: the throttled message is no longer lost

## The problem

Part 7 made the server drop a message over the limit and reply `chat_rate_limited`. The client never listened for it. `sendChatMessageFromPage()` cleared the input and emitted, so a throttled message was **gone**: the text wiped from the field, stored nowhere, with no feedback. This was flagged at the end of Part 7 as the follow-up; this is it.

Reproduced against `chat.js` from `git HEAD`:

```
FAIL  C0. chat.js registers a chat_rate_limited listener  — NOT registered
ok    C1. send emits chat_message and clears the input    — emits=1 input=""
FAIL  C2. rejected text is restored to the input          — no listener — message is lost
```

## The fix

### `public/js/chat.js:9–15` — state

```js
// Rate-limit recovery. The server (socket handler in server.js) drops a
// message over the limit and replies with chat_rate_limited, so the text is
// held here across the emit and put back if the send is rejected.
let chatPendingContent = '';
let chatRateBlocked    = false;
let chatRateDeadline   = 0;
let chatRateTimer      = null;
```

### `public/js/chat.js:142` — the listener

```js
socket.on('chat_rate_limited', handleChatRateLimited);
```

Registered in `initChatSocket()` beside the existing `connect` / `online_users` / `new_message` handlers.

### `public/js/chat.js:336–353` — send holds the text

Two additions to the existing function: an early `if (chatRateBlocked) return;` so a click or Enter during cooldown does nothing, and `chatPendingContent = content;` immediately before `input.value = ''`, so the text survives the clear. Part 7 measured the rejection arriving 1.5 ms after the emit, so the capture has to happen before the round trip, not after.

### `public/js/chat.js:355–396` — `chatRateTick()` and `handleChatRateLimited()`

`handleChatRateLimited({ retryAfterMs })`:

1. **Restores** `chatPendingContent` into `#chat-page-input`, but **only if the field is empty** — text the user began typing after sending is never clobbered.
2. **Disables** `#chat-page-send` and sets `chatRateBlocked`.
3. **Extends** the deadline with `Math.max(chatRateDeadline, Date.now() + retryAfterMs)` and starts the countdown interval only `if (!chatRateTimer)`. A burst delivers one event per rejected message (14 in Part 7's test); they share one timer, and the short `retryAfterMs` values that arrive later can only push the deadline out, never pull it in.
4. `chatRateTick()` writes `Slow down — wait Ns` into the notice each second, and on expiry clears the interval, re-enables the button, drops the flag, and hides the notice.

### `public/index.html:365, 368`

`id="chat-page-send"` added to the existing send button (it had none), and the notice element added inside `.chat-composer`:

```html
<div class="chat-rate-notice" id="chat-rate-notice" role="status" aria-live="polite" hidden></div>
```

`role="status"` + `aria-live="polite"` so the countdown is announced to screen readers. The inline `onclick` / `onkeydown` attributes are unchanged.

### `public/style.css:2576–2590`

`.chat-send-btn:disabled` (the button is not a `.btn`, so the existing `.btn:disabled` rule never applied to it), and `.chat-rate-notice` positioned absolutely above the composer — `.chat-composer` gets `position: relative` — so showing it never reflows the input row. Uses the existing `--warning-*` tokens, so it themes correctly in both light and dark.

## Verification

A jsdom harness loads the **real** `public/js/chat.js` with its cross-file globals stubbed and `io()` returning a fake socket that records `.on` registrations and `.emit` calls, so the real `initChatSocket()` registers the real listener and the harness invokes it exactly as the server would. `jsdom` was installed into the **scratchpad**; `package.json` and the lockfile are clean.

Baseline against `git HEAD` fails C0 and C2 — the message really is lost without this change. Working tree: **13/13**.

| # | Assertion | Result |
|---|---|---|
| C0 | `chat_rate_limited` listener registered | registered |
| C1 | Send emits and clears the input | `emits=1 input=""` |
| C2 | Rejected text restored | `input="hello team"` |
| C3 | Send button disabled | `disabled=true` |
| C4 | Notice visible, names the wait | `"Slow down — wait 1s"` |
| C5 | Send during cooldown is a no-op, text preserved | `emits=1 input="hello team"` |
| C7 / C8 | Button re-enabled, notice hidden and cleared | `disabled=false hidden=true` |
| C9 | Sending works again afterwards | `last emit="second try"` |
| C10 | Restore does not overwrite newly typed text | `input="typed something new"` |
| C11 | 13 short rejections after a long one do not shorten the countdown | `"wait 3s" -> "wait 3s"` |
| C12 | Still blocked 700 ms in (longest deadline honoured) | `disabled=true` |
| C13 | Unblocked once the longest deadline passes | `disabled=false hidden=true` |

C11–C13 assert the burst behaviour through the DOM rather than by reading module internals: a top-level `let` in a file loaded by `w.eval` is not reachable from a second `eval` call, though it is script-scoped and reachable in a real browser. Observing the countdown text and the button state is the stronger check regardless.

Regression: Part 7's unit and socket harnesses still pass (10/10, 8/8), confirming the server side is untouched, along with all the admin harnesses. `node --check public/js/chat.js` passes.

**Not proven here:** a real browser round trip. The listener, payload shape, DOM ids and timing are exercised against the real client code; only the socket transport is simulated.

## Note on the working tree

`public/app.js` now shows as deleted. That was the dead legacy bundle flagged in Part 5 — removed outside this change, not by it. Nothing references it, and no harness regressed.

## Part 8 — files and lines

| File | Lines | What changed |
|---|---|---|
| `public/js/chat.js` | 9–15 | Pending-text and cooldown state |
| `public/js/chat.js` | 142 | `chat_rate_limited` listener registration |
| `public/js/chat.js` | 337, 348–350 | Cooldown guard; capture text before clearing |
| `public/js/chat.js` | 355–396 | `chatRateTick()`, `handleChatRateLimited()` |
| `public/index.html` | 365, 368 | Send-button id; notice element |
| `public/style.css` | 2576–2590 | Disabled-button styling; `.chat-rate-notice` |

`server.js`, `utils/*`, `routes/*` and `private/admin.html` are unchanged since Part 7. Part 8 totals: `public/js/chat.js` +58 / −0, `public/index.html` +2 / −1, `public/style.css` +15 / −0.

---
---

# Part 9 — `chatPending` invariant closed in both directions

## The bug, which Part 8 introduced

Part 8 held the in-flight message in a **single slot**. It was written on every send and cleared only on rejection; the `new_message` confirmation path never cleared it. So the slot held the *last text sent*, not the message any given reply referred to. One slot cannot express "which of the N messages currently in flight does this reply answer", and with two sends outstanding — routine on any real-latency link — replies and slot contents desynchronise.

Reproduced against the Part 8 code:

```
FAIL  P1. first rejection restores the FIRST message
        — input="second message"    (wrong text restored; "first message" lost)
FAIL  P3. stray rejection with nothing outstanding leaves the composer empty
        — input="all done"          (already-sent text resurrected, invites a duplicate send)
4/6 passed — failing: P1, P3
```

## The fix — `public/js/chat.js` only

A bounded FIFO queue replaces the slot, with entries leaving in **both** directions.

### Lines 9–17 — the queue

```js
const CHAT_PENDING_MAX = 20;
let chatPending        = [];   // emitted, not yet confirmed or rejected — oldest first
```

Was `let chatPendingContent = '';`. No references to the old name remain.

### Lines 364–365 — send appends instead of overwriting

```js
chatPending.push(content);
if (chatPending.length > CHAT_PENDING_MAX) chatPending.shift();
```

The cap bounds memory if replies never arrive at all.

### Lines 149–156 — the missing direction: confirmation clears

```js
if (msg.user_id === currentUser?.id && chatPending[0] === msg.content) {
  chatPending.shift();
}
```

Added at the top of the existing `new_message` handler. Both guards are load-bearing: `user_id` stops another user's message consuming our entry (P4), and the head-content match stops our own message *from a different tab* — same `user_id`, not this tab's send — from desynchronising the queue. A non-matching message leaves the queue untouched, so the worst case is a stale entry the cap evicts, never a wrong restore.

### Lines 398–402 — rejection takes the head

```js
const rejected = chatPending.shift() || '';
const input    = document.getElementById('chat-page-input');
if (input && rejected && !input.value.trim()) {
  input.value = rejected;
}
```

The reply answers the oldest outstanding send, so the head is the right entry — not whatever was typed most recently. The deadline, timer, disable and countdown logic is unchanged from Part 8.

**Accepted limitation, chosen deliberately:** one input field cannot hold N rejected messages. The oldest rejected message is restored; later rejections in the same burst shift their own entries but find the field non-empty and do not restore. That keeps the restore chronological and predictable. In practice the server accepts the first 6 and this tab is blocked after the first rejection, so normally only one message is outstanding when the limit bites.

## Verification

`chat-pending-invariant-test.js` failed P1 and P3 on the Part 8 code and now passes **6/6**:

| # | Assertion | Before | After |
|---|---|---|---|
| P1 | Two in flight, both rejected → first rejection restores the **first** message | **FAIL** `"second message"` | ok `"first message"` |
| P2 | After a confirmed send, a rejection restores only the rejected text | ok | ok |
| P3 | Stray rejection with nothing outstanding leaves the composer empty | **FAIL** `"all done"` | ok `""` |
| P4 | Another user's `new_message` does not consume our pending entry | ok | ok |
| P5 | Duplicate content, first accepted second rejected → throttled copy restored | ok | ok |
| P6 | 500 unanswered sends stay bounded | not observable | ok — restored `"msg 480"`, the oldest retained of 20 |

P6 now asserts the bound through behaviour rather than by reading module internals: after 500 unanswered sends a rejection restores `msg 480`, exactly the oldest entry the 20-slot cap retains. (A top-level `let` is not reachable across separate `eval` calls in jsdom, though it is script-scoped in a real browser.)

Regression: Part 8's client harness holds at **13/13** — restore, disable, countdown, re-enable, no-clobber, burst deadline all still correct. Part 7's server harnesses stay 10/10 and 8/8, confirming `server.js` and `utils/chat-rate-limit.js` are untouched. All five admin harnesses pass. `node --check public/js/chat.js` passes.

**Not proven here:** a real browser round trip. Listener registration, payload shape, DOM ids and reply ordering run against the real client code; only the socket transport is simulated.

## Part 9 — files and lines

| File | Lines | What changed |
|---|---|---|
| `public/js/chat.js` | 9–17 | `chatPendingContent` slot → bounded `chatPending` queue |
| `public/js/chat.js` | 149–156 | `new_message` shifts the confirmed head (the missing direction) |
| `public/js/chat.js` | 364–365 | Send pushes and caps instead of overwriting |
| `public/js/chat.js` | 398–402 | Rejection restores the head, not the most recent text |

`public/index.html` and `public/style.css` are unchanged since Part 8 — the markup and styling stand. `server.js`, `utils/*`, `routes/*` and `private/admin.html` are unchanged since Part 7. Part 9 totals: `public/js/chat.js` +18 / −7.
