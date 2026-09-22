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

---
---

# Part 10 — HTTP chat write path shares the socket's bucket

## The bypass

Part 7 throttled `socket.on('chat_message')`. `POST /api/chat/messages` in `routes/chat.js` writes the **same two rows** to the same tables and was subject to none of it: no rate limit, and no length cap at all (the socket path had 2000). A logged-in user could bypass Part 7 entirely with a loop of HTTP posts and starve the pool exactly as before. Against `git HEAD`:

```
FAIL  A2. POST /messages mounts chatRateLimitMiddleware
FAIL  A3. handler enforces CHAT_MAX_LENGTH
FAIL  A4. handler rejects non-string content
```

The endpoint is kept — unused by the current client, retained for future use.

## Decisions

- **1100 / 1000 split.** The middleware pre-checks at 1100 characters (413); the handler enforces the business rule at 1000 (400). The 100-character gap is deliberate headroom, so the coarse guard never fires on a message the business rule would have allowed.
- **Socket cap aligned to 1000.** It was 2000. Two write paths for one feature with two different limits meant a 1500-character message would send over the socket and be refused over HTTP. One exported constant now governs both.
- **Length before bucket.** A malformed request is rejected without spending the user's legitimate quota (B8).

## The ordering constraint that shaped the design

`server.js` mounts the chat router at line 149 but built `chatLimiter` at line 183. A bucket living in `server.js` would be `undefined` when `routes/chat.js` is required. So the instance moved into `utils/chat-rate-limit.js` as a module singleton. Both files `require` it; Node's module cache guarantees they receive the same object, and both key it on the user id from the session. Six socket messages followed by an HTTP post is seven messages in one bucket, which is the property the request asked for and which B1/B2 prove in both directions.

## Changes

### `utils/chat-rate-limit.js:65–100` — the shared bucket, the limits, the middleware

```js
const CHAT_LIMIT       = { windowMs: 10_000, max: 6 };
const CHAT_MAX_LENGTH  = 1000;   // business rule, enforced on both write paths
const CHAT_HARD_LENGTH = 1100;   // coarse pre-check in the middleware; 100 chars of headroom
const chatLimiter      = createChatRateLimiter(CHAT_LIMIT);
```

`chatRateLimitMiddleware(req, res, next)` at lines 76–92: string content over 1100 → 413; then `chatLimiter.check(req.userId)` → 429 with `{ error, retryAfterMs, limit, windowMs }`, the same shape as the socket's `chat_rate_limited` payload so a future client can reuse Part 8's countdown unchanged; otherwise `next()`. `createChatRateLimiter` stays exported — Part 7's unit test builds its own instances with an injected clock. (Was 57 lines; now 101.)

### `routes/chat.js:5, 46–53`

Import at line 5. The middleware is mounted on the route at line 48, and the handler gains two guards:

```js
if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
if (content.length > CHAT_MAX_LENGTH)               return res.status(400).json({ error: `Message too long. Maximum ${CHAT_MAX_LENGTH} characters.` });
```

The `typeof` guard also fixes a live 500: `content?.trim()` on a numeric or array body threw `content.trim is not a function`. Same coercion class as Part 3 (B9 covers number, array, object, boolean, null). GET `/messages`, GET `/unread` and PATCH `/read` are untouched.

### `server.js:178–182, 231`

Lines 178–182 replace the local `createChatRateLimiter(...)` construction with an import of the shared `chatLimiter`, `CHAT_LIMIT`, `CHAT_MAX_LENGTH`. Line 231 in the socket handler:

```js
if (typeof content !== 'string' || !content.trim() || content.length > CHAT_MAX_LENGTH) return;
```

Was `content.length > 2000`, with no type guard. The bucket check above it and everything below are unchanged from Part 7.

## Verification

`chat-http-limit-test.js`, **17/17**. `routes/chat.js` cannot be mounted in a harness because `router.use(requireAuth)` queries the database, so the exported middleware runs directly and through a throwaway Express app with a stub auth and a handler mirroring the business rule. The "socket side" of each shared-bucket test is the same `chatLimiter.check(userId)` call the socket handler makes.

| # | Assertion | Result |
|---|---|---|
| B1 | Six socket checks, then an HTTP post for the same user → 429 | shared |
| B2 | Six HTTP posts (all 201), then a socket check → denied | shared, both directions |
| B3 | A different user is unaffected | 201 |
| B4 | 429 body carries `retryAfterMs` / `limit: 6` / `windowMs: 10000` | ok |
| B5 | 1101 chars → 413 from the middleware | ok |
| B6 | 1050 chars → passes middleware, 400 from the handler rule | ok |
| B7 | Exactly 1000 chars → 201 | ok |
| B8 | Six oversized (413) posts, then a valid one → 201 — 413 spends no quota | ok |
| B9 | number / array / object / bool / null content → 400, never 500 | ok |

Part A asserts the wiring by reading the files: the endpoint still exists, the middleware is mounted on it, both length rules and the type guard are present, `server.js` imports the singleton and no longer constructs its own, and no `2000` literal remains.

Regression: Part 7 unit 10/10 and socket 8/8 — the factory is still exported and the socket guard still fires; Part 8 client 13/13; Part 9 invariant 6/6; all five admin harnesses. `node --check` on all three files.

**Not proven here:** the route end to end against Postgres with a real session, since `requireAuth` needs both. The middleware, the shared instance, the status codes and the length rules all run against the real module.

## Flagged, not done

- **`requireAuth` runs before this middleware** and issues a session-store query per request. A flood still costs one DB round trip each even when thrown out at 429. Rate limiting ahead of authentication is a larger change.
- **The HTTP route never emits `new_message`**, so a message posted this way does not appear live for other users until they reload. Pre-existing, unchanged.
- **Socket cap dropped from 2000 to 1000.** A user who could previously send 1001–2000 characters over the socket no longer can. Chosen deliberately for one consistent rule.

## Part 10 — files and lines

| File | Lines | What changed |
|---|---|---|
| `utils/chat-rate-limit.js` | 65–68 | `CHAT_LIMIT`, `CHAT_MAX_LENGTH`, `CHAT_HARD_LENGTH`, the shared `chatLimiter` |
| `utils/chat-rate-limit.js` | 76–92 | `chatRateLimitMiddleware` |
| `utils/chat-rate-limit.js` | 94–101 | Exports extended |
| `routes/chat.js` | 5 | Import |
| `routes/chat.js` | 48 | Middleware mounted on `POST /messages` |
| `routes/chat.js` | 52–53 | Type guard; 1000-char rule |
| `server.js` | 178–182 | Local construction → shared import |
| `server.js` | 231 | Socket cap `2000` → `CHAT_MAX_LENGTH`; type guard added |

`public/*` and `private/admin.html` are unchanged since Part 9. Part 10 totals: `utils/chat-rate-limit.js` +44 / −1, `routes/chat.js` +7 / −2, `server.js` +4 / −5.

---
---

# Part 11 — Pre-auth IP backstop so a rejected flood does zero DB work

## Why, following Part 10

Part 10's per-user limiter removed the two DB **writes** on a chat flood, but two DB **reads** survived per rejected request: the global session middleware (`connect-pg-simple` `SELECT sess`) and `requireAuth`'s `user_workspaces SELECT` both run before the per-user limiter, because you cannot key a limit on a user you have not yet identified. This adds a coarse backstop that rejects a flood **before authentication**, keyed on the client IP — trustworthy since Part 2 resolved `req.ip` through the Cloudflare CIDR list. It sits in front of the per-user bucket, not in place of it.

## The ordering, which is the whole point

`req.ip` is usable after `app.set('trust proxy', …)` at `server.js:42`. The DB touchpoints to get in front of are `express.json()` and the session middleware. So the backstop mounts **above both**: a flooded request is rejected before its body is parsed and before any session or auth query runs.

## Change — `server.js` only, two additions

### Lines 103–113 — the limiter

```js
const chatIpLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  message: { error: 'Too many chat requests from this IP. Please slow down.' },
  standardHeaders: true, legacyHeaders: false,
});
```

No custom `keyGenerator` — the default keys on `req.ip` with express-rate-limit's IPv6-safe handling, inheriting the trusted `req.ip` from Part 2.

### Line 117 — mounted above `express.json()` (119) and the session middleware (128)

```js
app.post('/api/chat/messages', chatIpLimiter);
```

`app.post`, not `app.use` — scoped to the write path only, so the client's `GET /messages` history and `GET /unread` polling are never throttled by it. Under the limit it calls `next()` and the request flows down the unchanged chain (json → session → `requireAuth` → the per-user `chatRateLimitMiddleware` → handler). Over the limit it returns 429 first.

Nothing else changed: `routes/chat.js`, `utils/chat-rate-limit.js` and the socket handler stand as Part 10 left them.

## Verification

`chat-ip-backstop-test.js`, **10/10**. As in Part 2, the real `server.js` can't be required (it calls `initDb()` and listens), so the harness mirrors the middleware order with the **real** `utils/trusted-proxies.js` and an identically-configured limiter, then reads `server.js` to assert the real wiring. A counting stub after the limiter stands in for the session + auth SELECTs.

| # | Assertion | Result |
|---|---|---|
| N1 | 130 POSTs from one IP → 120×201, 10×429 | ok |
| N2 | **Rejected requests do zero DB work — stub ran exactly 120×** | `dbCalls=120` |
| N3 | A different client IP has its own bucket | 201 |
| N4 | Varying forged `X-Forwarded-For` still shares one bucket → flood blocked | `429=10` |
| N5 | 429 carries `RateLimit-Limit` and `Retry-After` | `limit=120 retryAfter=60` |
| W1–W5 | `chatIpLimiter` defined; mounted with `app.post` (not `app.use`); above `express.json()` (117 < 119); above the session middleware (117 < 128); Part 10's per-user route intact | ok |

N2 is the crux: the 10 rejected requests never reached the stub, so a flood costs no session lookup and no auth query. N4 confirms the IP cannot be spoofed to split the bucket, reusing Part 2's `req.ip` resolution.

Regression: Part 7 unit 10/10 and socket 8/8, Part 8 client 13/13, Part 9 invariant 6/6, Part 10 HTTP 17/17 (per-user bucket and length caps intact), Part 2 bypass control unchanged, all five admin harnesses. `node --check server.js`.

**Not proven here:** the real boot against Postgres with a live session. Ordering, IP keying and the zero-DB property run against the real trust-proxy module and the real `server.js` text; only the socket/DB transport is simulated.

## Accepted tradeoff

IP keying means users behind one NAT or corporate egress share the 120/min allowance. It is a backstop well above the ~36/min a single authenticated user can legitimately reach (6 per 10 s), so normal use stays clear; `max` is one line to raise for a large shared egress. The per-user bucket remains the precise control, and the socket path is unaffected — it never carried this cost, since a socket connection authenticates once at connect time rather than per message.

## Part 11 — files and lines

| File | Lines | What changed |
|---|---|---|
| `server.js` | 103–113 | `chatIpLimiter` definition |
| `server.js` | 115–117 | Mounted on `POST /api/chat/messages`, above json and session |

`routes/chat.js`, `utils/chat-rate-limit.js`, `public/*` and `private/admin.html` are unchanged since Part 10. Part 11 totals: `server.js` +15 / −0.

---
---

# Part 12 — Validate before the bucket: invalid messages no longer spend quota

## The bug, which Part 7 introduced and Part 10 carried over

`chatLimiter.check(userId)` **consumes** a token. On both write paths it ran before content validation, so a message rejected as empty, non-string or over the length cap had already spent the sender's quota.

- **Socket** (`server.js`): bucket check at 237, validation at 246. Six oversized pastes left a legitimate user rate-limited with zero messages sent and no feedback.
- **HTTP** (`utils/chat-rate-limit.js`): the middleware pre-checked only `> 1100` before the bucket. Empty content and lengths 1001–1100 passed that guard, consumed a token, then got 400 from the handler. Same bug, narrower window.

Part 7 put the bucket first so a spammer "costs nothing beyond a Map lookup." That reasoning was about DB work and still holds — validation is pure CPU with no DB access and no state mutation, so running it first costs nothing, and the bucket still gates every `pool.query`. What changes: a token is spent only by a well-formed, acceptable message.

Reproduced against a pre-edit snapshot:

```
FAIL  Q1. empty "" x6 -> 400 each, then 6 valid -> all 201   — valid=429,429,429,429,429,429
FAIL  Q2. length 1050 x6 -> 400 each, then 6 valid -> all 201 — valid=429,429,429,429,429,429
FAIL  Q3. non-string 123 x6 -> 400, then 6 valid -> all 201   — valid=429,429,429,429,429,429
FAIL  S1. server.js: validation line is ABOVE chatLimiter.check — validation 246, check 237
FAIL  S3. mirror: 10 oversized then 6 valid -> all 6 accepted  — accepted=0 limited=10
```

## Changes

### `server.js:234–248` — reorder, no new logic

The existing validation line moved from below the bucket check to above it (now line 238; the check is at 240). Comment rewritten to state the new rationale. The `chat_rate_limited` emit, the early return, and all DB writes are unchanged. Silent drop of invalid content is pre-existing behaviour and stays.

### `utils/chat-rate-limit.js:79–90` — full validation before the bucket

Was one guard (`> 1100 → 413`). Now three, in this order, all ahead of `chatLimiter.check`:

```js
if (typeof content !== 'string' || !content.trim()) → 400 'Message cannot be empty'
if (content.length > CHAT_HARD_LENGTH)               → 413 'Message too long…'
if (content.length > CHAT_MAX_LENGTH)                → 400 'Message too long…'
```

Order preserves the 413/400 split decided in Part 10: `> 1100` is tested before `> 1000`, so 1001–1100 still yields 400 and > 1100 still yields 413 (Q5).

### `routes/chat.js` — untouched

The handler's own checks (lines 52–53) are now redundant for the normal path but stay as defence in depth: the route still behaves correctly if ever mounted without the middleware.

## Verification

`chat-quota-order-test.js`, **10/10**. Run first against a pre-edit snapshot of both files (failing baseline above), then against the live tree.

**HTTP — real exported middleware.** Each case sends six invalid messages for a fresh user, then six valid 1000-char messages; all six valid must be 201.

| # | Six invalid → | Then six valid → | Before | After |
|---|---|---|---|---|
| Q1 | `""` → 400 | 201 | **429 ×6** | ok |
| Q2 | 1050 chars → 400 | 201 | **429 ×6** | ok |
| Q3 | `123` → 400 | 201 | **429 ×6** | ok |
| Q4 | 1101 chars → 413 | 201 | ok | ok |
| Q5 | Split preserved: 1050 → 400, 1101 → 413 | | ok | ok |
| Q6 | 7th valid message → 429 (bucket intact) | | ok | ok |

**Socket — static order on the real source + a mirror that follows it.** S1 parses `server.js` and asserts the validation line is above `chatLimiter.check` inside the handler (238 < 240); S2 that the check is still above the first `pool.query` (240 < 250), so Part 7's cost property holds. S3/S4 run a line-for-line mirror whose order is read from the source: ten oversized then six valid → all six accepted, zero rate-limited; the seventh → rate-limited.

Regression: Part 7 unit 10/10 and socket 8/8, Part 8 client 13/13, Part 9 invariant 6/6, Part 10 HTTP 17/17, Part 11 backstop 10/10, Part 2 control unchanged, all five admin harnesses. `node --check` on both files.

**Not proven here:** the real socket handler against Postgres with a live session. Its ordering is asserted from the real source; its behaviour from the mirror.

## Flagged, not done

- **Silent drop on the socket.** An oversized or empty socket message is still dropped with no event back — now at no cost to the sender's quota, but still with no explanation. A `chat_rejected` emit plus a client listener would be the follow-up, mirroring Part 8's `chat_rate_limited` handling.

## Part 12 — files and lines

| File | Lines | What changed |
|---|---|---|
| `server.js` | 235–238 | Validation moved above the bucket check; comment rewritten |
| `utils/chat-rate-limit.js` | 79–90 | Empty/type and `> 1000` guards added ahead of the bucket, ordered to keep the 413/400 split |

`routes/chat.js`, `public/*` and `private/admin.html` are unchanged since Part 11. Part 12 totals: `server.js` net-zero move (+4 / −4), `utils/chat-rate-limit.js` +9 / −0.

---
---

# Part 13 — Chat send as request/response via Socket.IO acks

## Why — and what it supersedes

The socket send was fire-and-forget: `socket.emit('chat_message', content)`, with replies arriving as unrelated events (`new_message`, `chat_rate_limited`) or not at all. Nothing tied a reply to the send it answered, so the client grew a correlation mechanism — Part 8's slot, then Part 9's bounded FIFO with head-content matching — and two silent-loss paths remained: invalid content was dropped with no event (flagged in Parts 7 and 12), and a DB failure logged to the console while the client heard nothing and its pending entry went stale.

Socket.IO acknowledgements make each send a request with its own response. The emit's callback receives *that emit's* outcome, so correlation is free, every send is answered, and `socket.timeout(ms)` turns "no answer" into a detectable error. **This part deletes Part 9's queue entirely** — the closure that emitted the message is the one that hears back about it. The `new_message` room broadcast is unchanged; the ack replaces only the sender-facing side channel.

Baseline against a pre-edit snapshot of both files:

```
server (old handler):  FAIL A1–A4 — every ack times out ("operation has timed out"); invalid and DB error are silent
                       FAIL W1–W6 — no ack parameter, no reply() fallback, no answered outcomes
client (old chat.js):  FAIL C1     — emit carries no callback (cb=undefined, timeout=null)
                       FAIL C9     — chatPending / chat_rate_limited listener still present
```

## Changes

### `server.js:234–289` — handler takes `(content, ack)` and answers on every path

A `reply(payload)` helper (239–248) calls the ack when present; when absent — a tab still running the previous `chat.js` — it falls back to the old `chat_rate_limited` emit so nothing is silently lost mid-deploy. Static JS is served `no-cache`, so that window closes on the tab's next reload.

Four outcomes, two of them new:

| Path | Line | Reply |
|---|---|---|
| Invalid (non-string / empty / > 1000) | 254 | `{ ok: false, reason: 'invalid', maxLength }` — **was silent** |
| Over the per-user limit | 259–265 | `{ ok: false, reason: 'rate_limited', retryAfterMs, limit, windowMs }` |
| Both inserts succeeded | 284 | `{ ok: true, id, created_at }` |
| Either insert threw | 287 | `{ ok: false, reason: 'server_error' }` — **was silent** |

Part 12's order — validate → bucket → `pool.query` — is preserved (W8). The two inserts and the `new_message` broadcast are untouched.

### `public/js/chat.js` — send with a callback; queue deleted (415 → 424 lines)

**Lines 9–18.** `CHAT_PENDING_MAX` and `chatPending` removed; `CHAT_ACK_TIMEOUT_MS = 5000` and `chatNoticeTimer` added. The three cooldown variables from Part 8 stay.

**Line 145.** The `new_message` handler no longer shifts a queue; the `socket.on('chat_rate_limited', …)` registration is gone.

**Lines 337–365 — `sendChatMessageFromPage()`.** After clearing the input:

```js
socket.timeout(CHAT_ACK_TIMEOUT_MS).emit('chat_message', content, (err, reply) => {
  if (!err && reply?.ok) return;                 // rendered via the new_message broadcast
  restoreChatInput(content);                     // this closure's own text — no queue
  if (!err && reply?.reason === 'rate_limited') return beginChatCooldown(reply);
  showChatNotice(err ? 'Message not sent — connection timed out. Try again.'
    : reply?.reason === 'invalid' ? `Message must be 1–${reply.maxLength || 1000} characters.`
    : 'Message not sent. Try again.', 4000);
});
```

**Lines 387–424 — three functions replace `handleChatRateLimited`:**
- `restoreChatInput(text)` — Part 8's non-destructive rule, unchanged: only if the field is empty.
- `showChatNotice(text, ms)` — transient notice for invalid / timeout / server-error, reusing `#chat-rate-notice`; auto-hides; yields to the countdown if a cooldown is active.
- `beginChatCooldown(reply)` — Part 8's disable + countdown + re-enable machinery, unchanged except it no longer touches a queue.

`chatRateTick()` (367–385) is untouched. No markup or CSS changes.

## Verification

**Server — real Socket.IO round trip** (`chat-ack-server-test.js`, **14/14**). A throwaway server runs a handler mirroring `server.js` line for line with the real limiter and a switch in place of `pool.query`; a real `socket.io-client` drives it.

| # | Assertion | Result |
|---|---|---|
| A1 | Valid → ack `{ ok: true, id }` **and** `new_message` broadcast received | both channels, one render path |
| A2 | Oversized → ack `{ reason: 'invalid', maxLength: 1000 }` | no longer silent |
| A3 | 7th message → ack `{ reason: 'rate_limited', retryAfterMs, limit: 6, windowMs: 10000 }` | ok |
| A4 | DB failure → ack `{ reason: 'server_error' }` | no longer silent |
| A5 | Client emitting **without** a callback, over the limit → still gets `chat_rate_limited` | stale-tab compat |
| A6 | Server withholds the ack → `socket.timeout()` callback receives an error | ok |
| W1–W8 | Signature has `ack`; `reply()` falls back; all four outcomes present; `catch` answers; broadcast intact; Part 12 order intact | ok |

**Client — real `chat.js` in jsdom** (`chat-ack-client-test.js`, **10/10**). Fake socket whose `timeout()` returns itself and whose `emit` captures the callback.

| # | Assertion | Result |
|---|---|---|
| C1 | Send emits with a callback and a 5000 ms timeout; input cleared | ok |
| C2 | `ok` → nothing restored, no notice | ok |
| C3 | `rate_limited` → restored, button disabled, "wait 1s", re-enabled after the window | Part 8 preserved |
| C4 | `invalid` → restored, notice names the 1000 limit, button **stays enabled** | ok |
| C5 / C6 | `server_error` / timeout error → restored, notice shown | ok |
| C7 | **Two in flight, both rejected → first rejection restores the first text** | Part 9's bug, correct by construction |
| C8 | Restore does not overwrite text typed since the send | ok |
| C9 | No `chatPending`, `CHAT_PENDING_MAX`, `handleChatRateLimited`, or `chat_rate_limited` listener remains | ok |
| C10 | Transient notice auto-hides after ~4 s | ok |

**Retired harnesses, on purpose.** Part 8's `chat-client-ratelimit-test.js` and Part 9's `chat-pending-invariant-test.js` tested the queue this part removes. Run against the new code they fail for exactly that reason — Part 8 on "no `chat_rate_limited` listener registered", Part 9 with "`socket.timeout` is not a function" because its fake socket predates acks. Every behavioural guarantee they made (restore, cooldown, non-destructive restore, overlapping sends) is re-asserted above in C3, C7 and C8. They are not silently dropped; they are superseded.

**Two kept harnesses needed a one-line regex relaxation**, not a logic change: Part 10's A7 and Part 12's S1 matched the socket validation line literally as `…CHAT_MAX_LENGTH) return;`, which is now `…CHAT_MAX_LENGTH) {`. Both now accept either form; their intent — "uses `CHAT_MAX_LENGTH`, no `2000` literal" and "validation precedes the bucket" — is unchanged and still passes.

**Regression:** Part 7 unit 10/10 and socket 8/8, Part 10 HTTP 17/17, Part 11 backstop 10/10, Part 12 quota-order 10/10, Part 2 control unchanged, all five admin harnesses. `node --check` on both files.

**Not proven here:** the real handler against Postgres with a live session. The server shape is mirrored line for line and the client is the real file.

## Part 13 — files and lines

| File | Lines | What changed |
|---|---|---|
| `server.js` | 234–248 | Signature `(content, ack)`; `reply()` helper with no-ack fallback |
| `server.js` | 254, 259–265 | `invalid` and `rate_limited` answered through `reply()` |
| `server.js` | 284, 285–288 | Success answered; `catch` answers `server_error` |
| `public/js/chat.js` | 9–18 | Queue removed; `CHAT_ACK_TIMEOUT_MS`, `chatNoticeTimer` added |
| `public/js/chat.js` | 145 | `new_message` shift and `chat_rate_limited` listener removed |
| `public/js/chat.js` | 349–364 | Send uses `socket.timeout().emit(…, callback)` |
| `public/js/chat.js` | 387–424 | `restoreChatInput`, `showChatNotice`, `beginChatCooldown` replace `handleChatRateLimited` |

`routes/chat.js`, `utils/chat-rate-limit.js`, `public/index.html`, `public/style.css` and `private/admin.html` are unchanged since Part 12. Part 13 totals: `server.js` +26 / −4, `public/js/chat.js` +49 / −40.

---
---

# Part 14 — Contacts import: batched queries, same writes, no schema change

## Your constraints, and how each is met

| Constraint | How it is honoured | Proof |
|---|---|---|
| **No DDL, no new columns, no index, no migration** | `db.js` not touched; the route contains no `CREATE`/`ALTER`/`DROP` | `git diff --quiet db.js` passes; diff grep for DDL = 0 |
| **Schema is fixed** | Writes hit the same four statements' tables — `contacts` (insert + update), `custom_fields`, `deals` — with the identical 8-column `contacts` list and the same value expressions | T2 asserts every array element equals what the per-row statement received; column list regex matches verbatim |
| **Logic is fixed** | Same rows inserted or updated by the same rule (email found → update, else insert); nameless rows skipped; `imported` counts every processed row; deals for new/updated under the same flags; title `'Deal: ' + trimmed name`; stage `defaultStageId \|\| null` | T1b, T3, T4, T6 |
| **Response identical** | Exactly `{ imported, deals_created }` | T11 |

## The bottleneck

`POST /api/contacts/import` looped row by row inside one transaction: an email `SELECT`, then `INSERT` or `UPDATE`, then optionally a deal `INSERT` — 1–3 sequential round trips per row on one of the pool's 10 connections (`pg` default), with no timeout. Measured against the pre-edit route with a query-counting fake pool:

```
1000 rows, deals on:   2753 DB round trips
2001 rows:             accepted — no cap — 4004 round trips
any failure:           500
```

One finding that gated the request: `express.json()`'s default **100 kB** body limit already rejected imports above ~500 rows at the parser, and the client then displayed "Successfully imported undefined contacts" because `runImport` never checked `res.error`.

## Changes

### `routes/contacts.js:32–237` — the import, batched

- **Cap (47):** `> 2000` rows → **413** before any DB work. `IMPORT_CHUNK = 500`.
- **Classify (55–65), no DB:** the loop's own rules. Rows whose email appears **more than once in the file** are set aside for the original per-row path — the only way to keep today's insert-then-update-and-count-each behaviour exactly. Everything else is batched.
- **Transaction limits (74–76):** `SET LOCAL statement_timeout='30s'`, `idle_in_transaction_session_timeout='15s'`, `lock_timeout='5s'`. Transaction-scoped: reset on COMMIT/ROLLBACK, cannot leak to the next user of the pooled connection. Ordinary-role GUCs, nothing persisted.
- **`newFields` (85):** one `INSERT … SELECT FROM unnest(…) ON CONFLICT DO NOTHING` — positions `m + 1 + i` as before.
- **One prefetch (110)** replaces N lookups: `SELECT id, email FROM contacts WHERE workspace_id=$1 AND email = ANY($2::text[])`. Same predicate.
- **Partition (117–121):** email found → update, else insert.
- **Multi-row update / insert via `unnest` (126–169), chunked at 500.** Column lists and value expressions are the per-row statements' own: `name.trim()`, `email.toLowerCase().trim()`, `phone||null`, `company||null`, `stage_id||null`, update `assigned_to = row.assigned_to||req.userId`, insert `assigned_to = defaultAssigneeId||req.userId`, `JSON.stringify(custom_data||{})`. Arrays keep the parameter count constant per statement.
- **Deals in one statement (172–184):** `INSERT INTO deals … SELECT $1, c.id, $2, $3, 'Deal: ' || c.name FROM contacts c WHERE c.workspace_id=$1 AND c.id = ANY($4::int[])` — the title comes from the row just written, so there is no reliance on `RETURNING` order.
- **In-file duplicates (187–222):** the original loop body, unchanged.
- **Error mapping (230–232):** pg `57014` → **504** "Import timed out"; `55P03` → **503** "Database busy"; anything else still `next(e)` → 500. `ROLLBACK` + `release()` on every failure path, as before.

### `server.js:123` — larger body for this one route

`app.post('/api/contacts/import', express.json({ limit: '2mb' }));` mounted above the global parser (125) and the session middleware (134). body-parser skips an already-parsed body, so nothing else gets the larger limit.

### `public/js/admin-import.js:243` — one guard

`if (res.error) { alert(res.error); return; }` before `res.imported` is read, so 413/503/504 are visible instead of "imported undefined".

## Verification

No Postgres is reachable from a harness and the live Supabase DB is off-limits, so the **real** `routes/contacts.js` runs against a **fake pool injected through `require.cache`** (`chat-import-batch-test.js`). The fake pattern-matches SQL, returns canned rows, and records every query — the round-trip count is directly observable. Baseline ran first against a pre-edit copy of the route.

| # | Assertion | Before | After |
|---|---|---|---|
| T1 | 1000 rows with deals — DB round trips | **2753** | **11** |
| T1b | `imported` = 1000, `deals_created` = 750 | ok | ok |
| T2 | Update/insert arrays carry exactly today's values; column lists unchanged | per-row scalars | ok |
| T3 | Three rows sharing one email → three legacy lookups; `imported` counts all five | (no prefetch) | ok |
| T4 | 2 existing → one `UPDATE` of 2 ids; 2 new + 2 no-email → one `INSERT` of 4 | per-row | ok |
| T5 | 1200 inserts → chunks 500 / 500 / 200 | 1200 × 1 | ok |
| T6 | Deals: one statement; correct ids for new / updated / both / none; title `'Deal: ' \|\| c.name` | per-row | ok |
| T7 | `BEGIN` → three `SET LOCAL` → first write | **no SET LOCAL** | ok |
| T8 | `57014` → 504 + ROLLBACK + release; `55P03` → 503 | **500 / 500** | ok |
| T9 | 2001 rows → 413, zero queries; 2000 → 201 | **201, 4004 queries** | ok |
| T10 | 714 kB body: route parser accepts; global-only rejects 413 | ok | ok |
| T11 | Response is exactly `{ imported, deals_created }` | ok | ok |

Also asserted: `db.js` unchanged; zero DDL in the diff; the route writes only `contacts`, `custom_fields`, `deals`; the `contacts` insert column list is the same eight as before; the route parser sits above the global one in `server.js`; the client guard is present. `node --check` on all three files. Every earlier harness (Parts 2, 7, 10–13, admin) still passes.

**Not provable here:** the `unnest` statements against real Postgres. They are standard SQL, but the first real import should be a **small CSV** — a few rows, one existing contact, one no-email row — with the counts checked before a large file.

## Flagged, deliberately not done (your constraints)

- **No index on `contacts (workspace_id, email)`** — the prefetch is one query but still a sequential scan (audit P-01). One-line `CREATE INDEX IF NOT EXISTS` when DDL is acceptable.
- **Referenced ids unvalidated** (`stage_id`, `assigned_to`, `pipelineId`, `stageId`, `defaultAssigneeId`) — as today; a bad FK still fails the transaction.
- **Pool `connectionTimeoutMillis`** — a saturated pool still queues rather than failing fast; a `db.js` option.
- **True upsert via unique partial index** — the end state and the fix for the concurrent-import race; needs DDL and a data-cleanliness check first (`PUT /contacts/:id` stores email un-lowercased).

## Part 14 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/contacts.js` | 32–41 | `MAX_IMPORT_ROWS`, `IMPORT_CHUNK`, `importErrorStatus()` |
| `routes/contacts.js` | 43–237 | Import handler: cap, classify, `SET LOCAL`, prefetch, partition, chunked `unnest` writes, single deals statement, legacy path for in-file duplicates, error mapping |
| `server.js` | 118–123 | Route-specific `express.json({ limit: '2mb' })` above the global parser |
| `public/js/admin-import.js` | 243 | `res.error` guard |

`db.js` untouched. Part 14 totals: `routes/contacts.js` +146 / −34, `server.js` +6 / −0, `public/js/admin-import.js` +1 / −0.

---
---

# Part 15 — Email matching is case-insensitive on both sides

## The bug

Incoming emails were already normalised (`toLowerCase().trim()`) before every lookup and insert, but the **stored** side of each compare was not. Postgres `=` on `text` is case-sensitive, so a row saved as `John@Example.com` never matched an incoming `john@example.com`. Mixed-case rows exist because `PUT /contacts/:id` stored `email||null` exactly as typed.

Reproduced against pre-edit copies of both routes, with a fake pool that stores DB emails as-is and compares case-sensitively unless the SQL says `LOWER(email)`:

```
FAIL  L1. import: DB "John@Example.com", row "john@example.com"  — inserts=1   (duplicate contact)
FAIL  L3. legacy path against "Dup@X.com"                         — ids=[1000]  (updated the fresh duplicate, not the real row)
FAIL  L4. three mixed-case rows                                   — inserts=1
FAIL  L5. POST /contacts when DB has "John@X.com"                 — status=201 (should be 409)
FAIL  L6. PUT /contacts/:id "  John@X.com "                       — stored="  John@X.com "
FAIL  L7. webhook when DB has "Lead@Co.com"                       — inserts=1   (duplicate contact)
```

Every write path was creating duplicates for the same person whenever the stored spelling differed in case.

## The fix — match in lowercase, key the lookup by the lowercased value

Constraints honoured: **`db.js` and `routes/deals.js` untouched** (asserted with `git diff --quiet`). No DDL. The `UPDATE` statements never touch the `email` column, so a matched mixed-case row keeps its stored spelling — this is matching, not rewriting.

### `routes/contacts.js`

| Line | Was | Now |
|---|---|---|
| 112 | `AND email = ANY($2::text[])` — import prefetch | `AND LOWER(email) = ANY($2::text[])` |
| 117 | `existingByEmail.set(f.email, f.id)` | `existingByEmail.set(f.email.toLowerCase(), f.id)` — **the lookup is keyed by the lowercased stored value**, so `get()` by the lowercased incoming value hits |
| 195 | `AND email=$2` — legacy per-row lookup | `AND LOWER(email)=$2` |
| 280 | `AND email=$2` — `POST /contacts` duplicate check | `AND LOWER(email)=$2` |
| 306 | `email\|\|null` — `PUT /contacts/:id` write | `email ? email.toLowerCase().trim() : null` — same rule as `POST` (288); stops new mixed-case rows at the source |

### `routes/integrations.js`

| Line | Was | Now |
|---|---|---|
| 164 | `AND email=$2` — webhook `/receive/:key` lookup | `AND LOWER(email)=$2` |

Six lines of logic; the incoming side needed no change since it was already lowercased at every site. Zero plain `email =` compares remain in either file (asserted by grep).

**Performance note:** `LOWER(email)` cannot use an index on `email`. There is no index on `email` today (audit P-01, DDL not permitted), so nothing regresses; a functional index on `LOWER(email)` is the eventual fix.

## Verification

`chat-import-lowercase-test.js` — the **real** `routes/contacts.js` and `routes/integrations.js` against the `require.cache`-injected fake pool from Part 14, extended so stored emails keep their case and the compare mode is read from the SQL. Baseline first (1/7), then live (**7/7**):

| # | Scenario | Before | After |
|---|---|---|---|
| L1 | Import: DB `John@Example.com`, row `john@example.com` | INSERT (dup) | UPDATE id 500 |
| L2 | Import: DB `john@example.com`, row `JOHN@Example.COM` | UPDATE | UPDATE (sanity) |
| L3 | Legacy in-file-dup path against `Dup@X.com` | INSERT then update the dup | both UPDATE id 500 |
| L4 | Three mixed-case rows, three incoming → all resolve via the lowercased map key | 1 INSERT | ids 501, 502, 503 updated |
| L5 | `POST /contacts` `john@x.com` when DB has `John@X.com` | 201 | **409** |
| L6 | `PUT /contacts/:id` `"  John@X.com "` → stored value | as typed | `john@x.com` |
| L7 | Webhook: DB `Lead@Co.com`, payload `lead@co.com` | INSERT (dup) | 200, `contact_id: 500`, UPDATE, no INSERT |

Also asserted: `db.js` and `routes/deals.js` unchanged; `LOWER(email)` at all four compare sites; no plain compares left; `node --check` on both files. Part 14's import harness needed a one-line regex relaxation (its T3 grepped the literal `AND email=$2`) and is back to **12/12**; every other harness (Parts 2, 7, 10–13, admin) unchanged.

**Not provable here:** `LOWER()` on real Postgres — standard, but the first real import against a known mixed-case contact should confirm it updates rather than duplicates.

## Flagged, not done

- **Whitespace** in stored emails: `PUT` also never trimmed before this part, so a row saved as `" john@x.com"` still misses. `LOWER(TRIM(email))` is a one-token extension.
- **Pre-existing case-duplicates**: two rows differing only by case now both match; the map keeps the last, so the update lands on one of them. Needs a data pass and, when DDL is allowed, a unique functional index.
- **Functional index** `ON contacts (workspace_id, LOWER(email))` — DDL, not now.

## Part 15 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/contacts.js` | 110–112 | Prefetch compares `LOWER(email)` |
| `routes/contacts.js` | 115–117 | Map keyed by `f.email.toLowerCase()` |
| `routes/contacts.js` | 195 | Legacy lookup compares `LOWER(email)` |
| `routes/contacts.js` | 280 | `POST` duplicate check compares `LOWER(email)` |
| `routes/contacts.js` | 306 | `PUT` normalises the stored email |
| `routes/integrations.js` | 164 | Webhook lookup compares `LOWER(email)` |

`db.js`, `routes/deals.js`, `server.js`, `public/*`, `private/*` unchanged since Part 14. Part 15 totals: `routes/contacts.js` +9 / −5 (four of the additions are comments), `routes/integrations.js` +1 / −1.

---
---

# Part 16 — Cross-workspace references rejected; read-side joins scoped (data exposure #1)

## The exposure

Foreign keys are global. A `stage_id`, `assigned_to`, `pipelineId`, `stageId` or `defaultAssigneeId` that belongs to **another workspace** is a real row, so every write path accepted it. Worse, `GET /contacts` and `GET /contacts/:id` joined `stages` and `users` on the raw id, so the foreign row was rendered straight back: a member could write a guessed `assigned_to` and read another workspace's user **name and email** from their own contact list, or a guessed `stage_id` and read its stage names. An id oracle, one write and one read per guess.

This was flagged as "deliberately not done" in Part 14 under the logic-is-fixed constraint. It is now done on request.

Baseline against a pre-edit copy of the route (4/17):

```
FAIL  R1/R2  GET joins unscoped
FAIL  R3/R4  POST /contacts with foreign stage_id / assigned_to     -> 201, written
FAIL  R7–R9  PUT and PATCH with foreign ids                         -> 200, written
FAIL  R11–R15  import with foreign row ids / defaultAssigneeId / pipelineId / stageId -> 201, written
FAIL  R17  import default-stage lookup unscoped (any pipeline's first stage)
```

## Changes — `routes/contacts.js` only; `db.js` and `routes/deals.js` untouched (asserted)

### Lines 9–38 — one guard, shared by every write path

- `workspaceRefs(q, workspaceId)` (15–26): **one** query — `SELECT 'stage', id FROM stages … UNION ALL SELECT 'user', id FROM users …`, both `WHERE workspace_id=$1` — returning the sets of stage ids and member ids that belong to the caller's workspace.
- `refCheck(refs, { stage_id, assigned_to })` (29–34): returns a message or `null`. Mirrors the write sites' `|| null` semantics: a falsy id means "not provided" and is never validated, so today's optional-field behaviour is unchanged.
- `ImportRejected` (36–38): `Error` with `status = 400`, so a rejection inside the import transaction rolls back and returns 400 rather than 500.

### Read side — the leak itself

| Lines | Change |
|---|---|
| 51–52 (`GET /`) | `LEFT JOIN stages … AND s.workspace_id = c.workspace_id`; `LEFT JOIN users … AND u.workspace_id = c.workspace_id` |
| 307–308 (`GET /:id`) | same two joins scoped |
| 319 (`GET /:id` activities) | author join scoped: `AND u.workspace_id = a.workspace_id` |

A foreign id now renders as unassigned / no stage instead of the foreign row. This also closes the leak for **rows poisoned before this part** — validation alone would not have.

### Write side — reject before any write

| Route | Lines | Check |
|---|---|---|
| `POST /contacts` | 332–333 | `refCheck` on `stage_id`, `assigned_to` → 400 |
| `PUT /contacts/:id` | 364–365 | same |
| `PATCH /contacts/:id/stage` | 377–378 | `refCheck` on `stage_id` → 400 |
| Import | 114–133 | Inside the transaction, after `SET LOCAL`, **before any write**: `workspaceRefs` once; `defaultAssigneeId` must be a member; `pipelineId` must be the workspace's (120); `stageId` must be in that pipeline and workspace (125); every row's `stage_id` / `assigned_to` via `refCheck`, rejected as `Row N: …` (133). Any failure → `ImportRejected` → `ROLLBACK` → 400. |
| Import default stage | 157 | `… WHERE pipeline_id=$1 AND workspace_id=$2` (was unscoped) |

`importErrorStatus` (69) maps `ImportRejected` to 400 ahead of the timeout codes.

**Cost:** one extra query per `POST`/`PUT`/`PATCH`; the import adds one prefetch plus at most two ownership lookups — the batching from Part 14 is intact (Part 14's harness still 12/12).

## Verification

`contacts-refs-test.js` — the **real** `routes/contacts.js` against a fake pool that knows which ids workspace 7 owns (stages 10, 11; users 1, 2; pipeline 9; pipeline_stage 55) and treats everything else as another workspace's real row. Baseline first (4/17), then live (**17/17**):

| # | Assertion |
|---|---|
| R1, R2 | `GET /` and `GET /:id` emit workspace-scoped joins (contact stage, contact user, activity author) |
| R3, R4 | `POST` with foreign `stage_id` 99 / `assigned_to` 77 → **400, zero writes** |
| R5, R6 | `POST` with own ids → 201; with no refs → 201 |
| R7–R9 | `PUT` and `PATCH /stage` with foreign ids → **400, zero writes** |
| R10 | `PATCH /stage` with own stage → 200 |
| R11 | Import, row 2 foreign `stage_id` → **400 "Row 2: stage_id does not belong to this workspace", ROLLBACK issued, zero writes** |
| R12–R15 | Import with foreign `assigned_to` / `defaultAssigneeId` / `pipelineId` 8 / `stageId` 12 (not in pipeline 9) → 400, zero writes |
| R16 | Import with all own refs → 201, contact and deal written |
| R17 | Default-stage lookup carries `AND workspace_id=$2` with the caller's workspace |

Also asserted: `db.js` and `routes/deals.js` unchanged; zero DDL; `node --check`. Regression: Part 14 12/12 and Part 15 7/7 (their fakes taught the new prefetch and ownership queries — lenient there, since those harnesses are not about references), Parts 2, 7, 10–13 and all admin harnesses unchanged.

**Not provable here:** the `UNION ALL` prefetch and the scoped joins against real Postgres — standard SQL. A quick real check: assign a contact to a member, list contacts, confirm the name still renders; then try `PUT` with a `stage_id` from another workspace and confirm the 400.

## Flagged, not done — the next "one by one" candidates

- **`routes/deals.js`** has the same class of gap: `contact_id`, `pipeline_id`, `stage_id`, `assigned_to` on deal writes, and its reads join `contacts`/`users` for names. Untouched here per the earlier instruction; same `workspaceRefs` / scoped-join pattern applies.
- **Tasks and activities** (`assigned_to`, `created_by` displays; `deal_id`/`contact_id` links) — tasks already validate `deal_id`/`contact_id` on write but not `assigned_to`.
- **Rows poisoned before this part** are now hidden by the scoped joins but still hold the foreign id. A one-off `UPDATE … SET assigned_to=NULL WHERE assigned_to NOT IN (workspace's users)` cleans them; data change, not code, so left for you.

## Part 16 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/contacts.js` | 9–38 | `workspaceRefs`, `refCheck`, `ImportRejected` |
| `routes/contacts.js` | 51–52, 307–308, 319 | Joins scoped to the row's workspace |
| `routes/contacts.js` | 69 | `ImportRejected` → 400 in `importErrorStatus` |
| `routes/contacts.js` | 114–133 | Import: prefetch + top-level and per-row reference checks, before any write |
| `routes/contacts.js` | 157 | Default-stage lookup scoped |
| `routes/contacts.js` | 332–333, 364–365, 377–378 | `POST`, `PUT`, `PATCH /stage` guards |

`db.js`, `routes/deals.js`, `routes/integrations.js`, `server.js`, `public/*`, `private/*` unchanged since Part 15. Part 16 totals: `routes/contacts.js` +67 / −7.

---
---

# Part 17 — Import counts and deal ids come from the database, not the input

## The bug (introduced in Part 14)

After each batched write, the import took its counters from the **input chunk** rather than from the write's result: `count += c.length` and `updatedIds.push(x.id)` after the `UPDATE … FROM unnest`, `count += c.length` after the `INSERT`, and `count++` after the legacy single-row `UPDATE` with `rowCount` never read.

The transaction runs at READ COMMITTED, so the prefetch and the later `UPDATE` see different snapshots. A contact deleted in between — or any id the `UPDATE`'s own `AND c.workspace_id=$1` excludes — matches **zero rows**, yet was counted as imported and its id handed to the deals statement. The deals statement itself was safe (it `SELECT`s from `contacts`, so a dead id yields no deal), but the legacy path had no such guard and created a deal for a contact its update never touched.

Reproduced against a pre-edit copy of the route, with a fake pool that returns a row from the prefetch but makes the `UPDATE` match nothing for it — the READ COMMITTED window exactly:

```
FAIL  K1. prefetch finds 500,501; 501 deleted before UPDATE  — imported=2 dealIds=[500,501]
FAIL  K3. legacy path: UPDATE matched 0                      — imported=2 legacyDeals=2 deals_created=2
FAIL  K4. insert count reads RETURNING (fake returns 2 of 3) — imported=3
```

## The fix — `routes/contacts.js` only, +14 / −6

Principle: every count and every id list is read back from the statement that did the work.

| Lines | Change |
|---|---|
| 194–201 | Batch `UPDATE … FROM unnest` gains `RETURNING c.id`; result captured as `matched` |
| 211–212 | `updatedIds` and `count` come from `matched`, not the input chunk |
| 233 | Insert counter reads `inserted.length` (the `RETURNING` rows), not `c.length` |
| 263–270 | Legacy `UPDATE` result captured; `if (upd.rowCount === 0) continue;` — a vanished row is neither counted nor allowed to reach the deal block |

The deals statement is unchanged: `dealIds` now contains only ids the writes actually touched, and `dealsCreated += result.rowCount` already read the result. No new queries. Response shape unchanged — `imported` is now **true** rather than differently shaped. `db.js` and `routes/deals.js` untouched (asserted).

## Verification

`contacts-counts-test.js` — the real route via `require.cache`, baseline first (1/6), then live (**6/6**):

| # | Scenario | Before | After |
|---|---|---|---|
| K1 | Prefetch finds 500, 501; 501 deleted before the `UPDATE`; deals for updated | `imported: 2`, deal ids `[500, 501]` | `imported: 1`, `[500]` |
| K2 | Same, no deals | 2 | 1 |
| K3 | Legacy path (in-file dup): lookup finds 500, `UPDATE` matches 0 | `imported: 2`, **2 legacy deals** | `imported: 0`, no deal |
| K4 | Insert count reads `RETURNING` (fake returns 2 of 3) | 3 | 2 |
| K5 | Nothing deleted: 3 updates + 2 inserts → `imported: 5`, deal ids all five | ok | ok |
| K6 | Batch `UPDATE` SQL ends with `RETURNING c.id` | — | ok |

Regression: Parts 14 (12/12), 15 (7/7), 16 (17/17) — their fakes now echo ids for `RETURNING c.id` — plus Parts 2, 7, 10–13 and all admin harnesses unchanged. `node --check`.

**Not provable here:** `RETURNING c.id` on `UPDATE … FROM` against real Postgres — standard and supported. A real check: import a small file over existing contacts and confirm `imported` equals the number of rows.

## Flagged, not done

- The prefetch → write window is inherent to READ COMMITTED. This makes the counts honest; it does not close the window. `SELECT … FOR UPDATE` on the prefetch would pin the rows but hold locks for the whole import — not worth it on a shared free-plan DB for a cosmetic race.

## Part 17 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/contacts.js` | 194–201, 211–212 | Batch update: `RETURNING c.id`; ids and count from the result |
| `routes/contacts.js` | 233 | Insert count from the result |
| `routes/contacts.js` | 263–270 | Legacy update: `rowCount` checked; vanished row skipped before the deal block |

Everything else unchanged since Part 16. Part 17 totals: `routes/contacts.js` +14 / −6.

---
---

# Part 18 — Import response reports dropped rows; `imported` split into `created` / `updated`

## Where the claim stands, and what was actually wrong

The final Part 14 plan and its change-log entry promised exactly `{ imported, deals_created }`, and harness T11 asserted exactly those two keys, so harness and code agreed. The extra fields (`created`, `updated`, `skipped`, `duplicates_in_file`) were in the *first* Part 14 draft, rejected under "response identical" and never implemented.

What was a bug regardless: nameless rows were dropped at the classification loop with **no count returned**. An import that silently discarded 50 rows returned the same body as a clean one. `imported` itself was correct — updates + inserts + legacy rows, matching the old loop.

Baseline against a pre-edit copy of the route:

```
FAIL  S1. 50 nameless rows + 3 named   — skipped=undefined imported=3
FAIL  S5. response keys                — deals_created,imported
```

This part **revises the Part 14 contract at the user's request**: the two original keys keep their names and meaning; three additive keys join them.

## Changes

### `routes/contacts.js`, +12 / −6

| Lines | Change |
|---|---|
| 94, 96 | `let skipped = 0;` — the silent `continue` for a nameless (or non-object) row now counts it |
| 154 | `let created = 0, updated = 0;` beside the existing counters |
| 215, 237 | Batch update / insert: `updated` / `created` advanced from the same DB results Part 17 made `count` read |
| 277, 287 | Legacy update / insert: `updated++` / `created++` beside the existing `count++` |
| 303 | Response: `{ imported, deals_created, created, updated, skipped }` |

`count` is untouched, so `imported` cannot drift; the invariant `imported === created + updated` holds at every site by construction and is asserted.

### `public/js/admin-import.js:247`

After the deal sentence: `if (res.skipped > 0) message += ` ${res.skipped} row(s) skipped (no name).`` — the user-facing half of the fix. An import that drops rows now says so.

`duplicates_in_file` is deliberately **not** added: the legacy path already handles in-file duplicates faithfully, and "extra occurrences" would need its own definition.

## Verification

`contacts-response-test.js` — real route via `require.cache`, Part 17's fake (echoes `RETURNING c.id`, can simulate a vanished row). Baseline 2/6, live **6/6**:

| # | Scenario | Before | After |
|---|---|---|---|
| S1 | 50 nameless rows (missing name, whitespace name, `null` row) + 3 named → `skipped: 50`, `imported: 3` | no `skipped` | ok |
| S2 | Nameless rows never reach the DB (insert array length 3) | ok | ok |
| S3 | 2 existing + 3 new + a legacy pair both updating → `created: 3`, `updated: 4`, `imported: 7` | no keys | ok |
| S4 | `imported === created + updated` in S3 and with a vanished row (`updated: 1`, `imported: 1`) | — | ok |
| S5 | Keys are exactly `imported, deals_created, created, updated, skipped` | two keys | ok |
| S6 | Client appends the skipped sentence when `res.skipped > 0` | — | ok |

Part 14's T11 was updated from "exactly two keys" to the five — a deliberate contract change, recorded here — and Part 14 is 12/12. Parts 15, 16, 17 read only the two original keys and pass unchanged (7/7, 17/17, 6/6). Parts 2, 7, 10–13 and all admin harnesses unchanged. `node --check` on both files; `db.js` and `routes/deals.js` untouched (asserted).

## Flagged, not done

- The client now knows *how many* rows were skipped, not *which*. Returning row indices is a larger response change.

## Part 18 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/contacts.js` | 94, 96 | `skipped` counted at the classification drop |
| `routes/contacts.js` | 154, 215, 237, 277, 287 | `created` / `updated` counters at the four DB-result sites |
| `routes/contacts.js` | 303 | Three additive response keys |
| `public/js/admin-import.js` | 247 | Skipped-rows sentence in the completion message |

`db.js`, `routes/deals.js`, `routes/integrations.js`, `server.js`, `private/*` unchanged since Part 17. Part 18 totals: `routes/contacts.js` +12 / −6, `public/js/admin-import.js` +1 / −0.

---
---

# Part 19 — Legacy in-file-duplicate path vs the Part 16 guard: covered, now pinned

## The concern

The legacy (in-file-duplicate) path still reads the raw `row.stage_id` / `row.assigned_to` at 269 and 283, so it looked as though the Part 16 cross-workspace fix might have been applied to the batch path only.

## What the check found — no route change needed

Part 16's guard is not on either write path. It is a single loop over **every input row**, inside the transaction, before any write (`routes/contacts.js:131–134`):

```js
for (let i = 0; i < rows.length; i++) {
  const bad = rows[i] && refCheck(refs, rows[i]);
  if (bad) throw new ImportRejected(`Row ${i + 1}: ${bad}`);
}
```

`rows` is the raw request array, so duplicate-email rows are validated identically to batch rows and up front. Both paths then pass the raw values through the same way — batch `x.row.stage_id||null` (209, 231), legacy `row.stage_id||null` (269, 283) — which is the Part 14 "logic is fixed" pass-through, safe because anything foreign was already rejected. Probed against the live route before touching anything:

```
legacy row w/ foreign stage_id    -> 400 "Row 2: stage_id does not belong to this workspace"  writes=0
legacy row w/ foreign assigned_to -> 400 "Row 1: assigned_to is not a member of this workspace" writes=0
legacy rows w/ own stage 10       -> 201  writes=2
```

What was genuinely missing was **evidence**: Part 16's harness only ever sent foreign ids on batch rows (R11, R12), so the legacy path's protection was never pinned and could have regressed silently.

## Changes

### `contacts-refs-test.js` (scratchpad) — three assertions, mirroring R11/R12 on the other path

| # | Assertion | Part 16 pre-edit snapshot | Live |
|---|---|---|---|
| R18 | Duplicate-email row 2 with foreign `stage_id` → 400 naming the row, `ROLLBACK`, zero writes | **201, 2 writes** | ok |
| R19 | Duplicate-email row 1 with foreign `assigned_to` → 400, zero writes | **201, 2 writes** | ok |
| R20 | Duplicate-email rows with own ids → 201, both written by the per-row `INSERT … VALUES` (proves they took the legacy path) | ok | ok |

Run first against Part 16's pre-edit snapshot: R18 and R19 fail there with a foreign id written, which is the proof the assertions detect an unprotected legacy path rather than passing vacuously. Live: **20/20**.

### `routes/contacts.js:257–259` — comment only

The legacy loop's header now states that its rows were validated by the reference loop above alongside the batch rows, so the raw reads below are safe. Zero behaviour change; exists so the next reader does not have to re-derive it.

### Deliberately not done

A shared `writeValues(row)` helper for structural symmetry between the paths. The two intentionally differ on `assigned_to` (update: `row.assigned_to||req.userId`; insert: `defaultAssigneeId||req.userId`, both preserved from the original loop), the values are already validated, and the refactor would be churn under the logic-is-fixed constraint.

## Verification

Refs harness 20/20 live, R18/R19 failing at the Part 16 baseline as required. `node --check routes/contacts.js`. `db.js` and `routes/deals.js` unchanged (asserted). Parts 14, 15, 17, 18 and everything earlier unchanged.

## Part 19 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/contacts.js` | 257–259 | Comment on the legacy loop; no logic |
| `contacts-refs-test.js` (scratchpad) | R18–R20 | Legacy-path coverage of the Part 16 guard |

Everything else unchanged since Part 18. Part 19 totals: `routes/contacts.js` +3 / −1, comment only.

---
---

# Part 20 — SR-1: analytics SQL injection parameterised

## The vulnerability

`routes/analytics.js` built the deal "value" SQL fragment by raw interpolation of a stored config value:
```js
valExpr = `(custom_data->>'${valueField}')::numeric`;   // and a d.-prefixed twin
```
`value_field` is written by any authenticated member via `PATCH /api/analytics/config` (no validation, no owner check) and interpolated at four query sites in `/summary` and `/trend`. It was the only user-controlled value in the codebase reaching SQL unparameterised. The queries bind a parameter array so they are single-statement (no `DROP`), but a payload such as `x')::numeric,(SELECT …)--` enables **error-based extraction** — coercing a subquery to `numeric` raises an error carrying the value — a cross-workspace read of any table, including other workspaces' password hashes. First reported in `CODE_AUDIT.md` as C1 / SR-1.

Baseline (pre-edit copy, fake pool recording every `{sql, params}`):
```
FAIL A1  payload "x')::numeric,(SELECT 1)--" appears in query TEXT
FAIL A2  custom field interpolated as ->>'revenue', key not bound
FAIL A3  PATCH /config accepts any value_field (all 200)
```

## The fix — `routes/analytics.js` only

### One resolver (`:13`)
```js
function valueSql(valueField, { prefix = '', paramIndex } = {}) {
  const col = `${prefix}custom_data`;
  if (valueField === 'value') return { expr: `${prefix}value`, params: [] };
  if (valueField) return {
    expr: `CASE WHEN jsonb_typeof(${col} -> $${paramIndex}) = 'number' `
        + `THEN (${col} ->> $${paramIndex})::numeric ELSE NULL END`,
    params: [valueField],
  };
  return { expr: 'NULL::numeric', params: [] };
}
```
The field key is **bound**, never interpolated (Postgres accepts a text bind on `->`/`->>`), and the `::numeric` cast runs only when the JSON value is actually a number, so a text field yields NULL instead of the 500 it throws today.

### Four call sites, each binding the key as `$2` (every query already binds only `wid=$1`)
- `:43` summary deals-by-stage `SUM`
- `:64` summary `AVG` + `WHERE … IS NOT NULL` (the fragment appears twice, both read `$2`, one param)
- `:89` summary by-pipeline `SUM` (`prefix: 'd.'`)
- `:190` trend value series `SUM`

Each interpolates `v.expr` and passes `[wid, ...v.params]`. The three inline `valExpr`/`pipelineValExpr` definitions are gone; **zero** `custom_data->>'…'` interpolation sites remain (asserted by grep).

### Write-side allowlist (`:218`)
`PATCH /config` now rejects a `value_field` that is neither `'value'` nor a `field_key` in this workspace's `deal_fields`, with 400. Defense in depth — the parameterisation is the real protection, so any bad-config row already stored is inert (it binds as a key that matches no JSON path → NULL).

**Behaviour note:** the `jsonb_typeof = 'number'` guard returns NULL for a value stored as a JSON *string* (`"1000"`), where the old bare cast would have parsed it. Correct per the fix and the intended cure for the text-field 500, but if deal custom numerics are stored as strings, value sums read 0 — confirm against real data.

## Verification

`analytics-sqli-test.js` — real route via a `require.cache` fake pool that records `{sql, params}`; the injection enters through the persisted config exactly as in production. Baseline 2/5, live **5/5**:

| # | Assertion | Before | After |
|---|---|---|---|
| A1 | Payload never in query text; travels as a bound param | in text | bound param |
| A2 | Custom field → `CASE WHEN jsonb_typeof(… -> $2) = 'number'`, key bound, no `->>'key'` literal | literal | 4 guarded queries, key bound |
| A3 | `PATCH /config`: bad field → 400; `value` / valid key / null → 200 | all 200 | 400 / 200 / 200 / 200 |
| A4 | `/summary` + `/trend` response key sets unchanged; builtin `value` still works | ok | ok |
| A5 | No unguarded `(custom_data ->> $2)::numeric` anywhere | (n/a) | ok |

**Not runnable here:** that a *text* deal field returns 200 with a null value rather than a 500 (also broken today) — asserted structurally via the guarded CASE; confirm against the live DB.

Regression: full suite green — Parts 14–19 (12/12, 7/7, 20/20, 6/6, 6/6), Parts 7/10/13, admin 26/26. `node --check routes/analytics.js`. `db.js` unchanged (asserted); response shapes unchanged (A4).

## Part 20 — files and lines

| File | Lines | What changed |
|---|---|---|
| `routes/analytics.js` | 13–24 | `valueSql` resolver — bound key, guarded cast |
| `routes/analytics.js` | 43, 64, 89, 190 | Four value-expression sites use the resolver + `[wid, ...params]` |
| `routes/analytics.js` | 218–223 | `PATCH /config` allowlist against `deal_fields` |

`db.js`, `routes/contacts.js`, `routes/deals.js`, `server.js`, `public/*`, `private/*` unchanged since Part 19. Part 20 totals: `routes/analytics.js` +34 / −21.

---

## Part 21 — Analytics page TypeError (stale element id) + SR-1 follow-ups

**Reported:** after Part 20 the analytics page failed with
`Unhandled Promise Rejection: TypeError: null is not an object (evaluating 'section.style')` at `switchPage (auth.js:385)`.

### Root cause — pre-existing, not Part 20

`auth.js:385` is only the `await loadAnalytics()` frame. The throw was in `public/js/analytics.js` `renderWinLoss`:

```js
const section = document.getElementById('analytics-winloss-section');   // no such id
const total   = d.won_deals + d.lost_deals + d.open_deals;
section.style.display = '';                                             // null.style
```

`index.html:508` has `id="analytics-sec-winloss"`. `git log -S` history: `analytics-winloss-section` was the id in **740e8a1** ("add analytics"); **330d40b** ("fixe analytics customization") renamed the markup and `renderWinLoss` was never updated. The line runs unconditionally after every successful `/summary` fetch, so the page has thrown on every visit since that rename. That it reached the render at all also confirms the Part 20 parameterised `/summary` returned 200 against real Postgres. A sweep of every `getElementById('analytics-…')` in the client (12 ids) found no other stale id — asserted as W4 below.

### Two SR-1 follow-ups carried in the same part

1. **String-stored numerics (regression from Part 20).** The deal form writes custom values as `el.value` (`public/js/modals.js:49`, `:1095`), i.e. JSON *strings*. Part 20's `jsonb_typeof(...) = 'number'` guard therefore mapped every custom numeric to NULL — value sums 0, `avg_value` null. The resolver now has a second branch: `jsonb_typeof = 'string'` **and** the text matches `'^\s*-?\d+(\.\d+)?\s*$'` → cast; anything else → NULL. A free-text field still cannot reach a bare `::numeric` (no 500).
2. **Typed bind.** The key is bound as `$n::text` at both `->` and `->>` rather than relying on unknown-type resolution.

Still one resolver, the same four call sites, the key bound and never interpolated. Response shapes unchanged. `db.js` untouched.

### What changed

`public/js/analytics.js` (`renderWinLoss`):
```js
const section = document.getElementById('analytics-sec-winloss');
if (!section) return;     // markup missing: skip the section, don't throw
```
The bar and legend live inside that section, so the early return also covers the two `innerHTML` writes below it.

`routes/analytics.js` (`valueSql`) — emitted expression for a custom field:
```sql
CASE WHEN jsonb_typeof(custom_data -> $2::text) = 'number' THEN (custom_data ->> $2::text)::numeric
     WHEN jsonb_typeof(custom_data -> $2::text) = 'string'
      AND (custom_data ->> $2::text) ~ '^\s*-?\d+(\.\d+)?\s*$' THEN (custom_data ->> $2::text)::numeric
     ELSE NULL END
```

### Verification

**Client — `analytics-winloss-test.js`** (jsdom, the real `public/js/analytics.js`, DOM shaped like `index.html`). Baseline is the file at git HEAD (it was unmodified before this part).

```
BASELINE (git HEAD)                                      LIVE
  FAIL W1 zero deals -> no throw        TypeError …'style'   ok  legend "No deal outcomes yet"
  FAIL W2 4 deals -> 3 segments, 50.0%  TypeError …'style'   ok  rendered
  FAIL W3 section absent -> no throw    TypeError …'style'   ok  skipped cleanly
  ok   W4 every analytics-* id exists in index.html (12)     ok
  1/4                                                        4/4
```

**Server — `analytics-sqli-test.js` + new A6.** Baseline is a mirror of the Part 20 file (`analytics-p21-baseline/`). A2/A5 regexes were relaxed to `\$2(::text)?\)` — a harness literal-match update, not a logic change.

```
BASELINE (Part 20 mirror)                                LIVE
  ok  A1–A5 (payload only in params, allowlist 400, shapes, no bare cast)   ok  A1–A5
  FAIL A6 bind is $2::text + 'string' branch  typed=false stringBranch=false  ok  typed=true stringBranch=true
  5/6                                                       6/6
```

**Regression sweep** (all scratchpad harnesses): admin-console-path 26/26, admin-invites-console 12/12, admin-logout 5/5, admin-session 7/7, analytics-sqli 6/6, analytics-winloss 4/4, chat-ack-client 10/10, chat-ack-server 14/14, chat-http-limit 17/17, chat-import-batch 12/12, chat-import-lowercase 7/7, chat-ip-backstop 10/10, chat-quota-order 10/10, chat-ratelimit 10/10, chat-spam 8/8, contacts-counts 6/6, contacts-refs 20/20, contacts-response 6/6, type-confusion 9/9. `ratelimit-bypass-test.js` shows its Part 2 control columns (A1 `trust proxy = 1`, B1 "WITHOUT global backstop") failing as designed; `server.js` is unchanged in this part. `chat-client-ratelimit-test.js` / `chat-pending-invariant-test.js` are the harnesses retired in Part 13 (fake socket predates acks) — unchanged status.

`node --check` passes on both files. `git diff --quiet db.js` and `routes/deals.js`: untouched.

**Not runnable here (real Postgres):** with a custom `number` deal field whose values are stored as strings, `/summary` should now return non-zero `pipeline_value`/`won_value` and a numeric `avg_value`; with a text field, 200 with nulls; `/trend` `value_trend` non-zero.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `public/js/analytics.js` | 205–209 | `renderWinLoss`: id `analytics-winloss-section` → `analytics-sec-winloss`; `if (!section) return;` guard |
| `routes/analytics.js` | 8–15 | Resolver comment: typed bind, string-stored values |
| `routes/analytics.js` | 18 | `const key = \`$${paramIndex}::text\`` |
| `routes/analytics.js` | 21–23 | CASE gains the `'string'` + numeric-regex branch; all binds via `key` |

`db.js`, `routes/contacts.js`, `routes/deals.js`, `server.js`, `private/*`, `public/index.html` unchanged since Part 20. Part 21 totals: `routes/analytics.js` +10 / −5 (vs the Part 20 file); `public/js/analytics.js` +5 / −1.

---

## Part 22 — SR-3 / C2: deals leak and accept cross-workspace ids

**Hole.** `routes/deals.js` joined `contacts` (as contact and as supplier), `pipeline_stages` and `users` on raw ids with no workspace check (list `:30–33`, detail `:50–53`), and POST / PUT / `PATCH /:id/stage` wrote `contact_id`, `supplier_id`, `pipeline_id`, `stage_id`, `assigned_to` straight from the body. Foreign keys are global, so a member could point a deal at another workspace's contact and read that contact's name, email and phone back from their own deal list (likewise another workspace's stage name/colour and user name). Two fixes: scope the joins (closes the read), validate the ids before any write (closes the write).

### Design

- **Reuse, not a second copy.** Part 16's `workspaceRefs`/`refCheck` moved from `routes/contacts.js:15–34` into a new `utils/workspace-refs.js`; both routes import from there. `workspaceRefs` (whole-workspace prefetch of contact `stages` + `users`, right for the import loop) is byte-for-byte the same SQL, so the Part 16 harness's literal match is unchanged. `ImportRejected` is import-specific and stays in `contacts.js`.
- **`dealRefs(q, workspaceId, ids)`** — new, for a single deal write: one round trip bound only to the ids actually supplied (`WHERE workspace_id=$1 AND id = ANY($n::int[])` over `contacts`, `pipelines`, `pipeline_stages`, `users`), so saving a deal never prefetches every contact in the workspace (Supabase free plan). Skipped entirely when no id is supplied. A non-integer id is not looked up, so it is rejected with 400 instead of the INSERT failing with 500.
- **`refCheck(refs, ids)`** — generalised: each of `contact_id`, `supplier_id`, `pipeline_id`, `stage_id`, `assigned_to` is checked only when the field is truthy **and** `refs` carries the matching set. The contacts path passes `{stages, members}` and so validates exactly what it did before, with the same two messages; the import loop passes whole rows and any deal-ish keys on them are ignored because the contacts refs carry no such set.
- **Joins.** `pipeline_stages` has its own `workspace_id` column, set by every insert site (`routes/pipelines.js:46,96`, `routes/auth.js:254`, `routes/workspace.js:78`), so the stage join scopes on `ps.workspace_id = d.workspace_id` directly rather than through `pipelines` — same guarantee, no fifth join on the hot list query. `users.workspace_id` exists (one user, one workspace), so `assigned_to` scopes directly too. Column lists unchanged → a foreign id now yields NULL name/email/phone instead of the leak.
- **Writes.** POST and PUT validate all five ids before the INSERT/UPDATE; `PATCH /:id/stage` validates `stage_id` — the same hole in one more place, listed here so it is not a silent widening. The POST default assignee (`req.userId`) comes from the session, not the body, and is not validated. PUT order is validate → UPDATE → existing 404, so a foreign id on a nonexistent deal gets 400; nothing is written either way.
- **Not touched:** the `deal_objects` endpoints (`objects` cross-workspace is M2, its own part), urgency, delete, `db.js`, response shapes.

### Verification — `deals-refs-test.js`

Real `routes/deals.js` behind a fake pool recording every `{sql, params}`; fixture: workspace 7 owns contact 10 / pipeline 20 / stage 30 / user 1, workspace 8 owns 11 / 21 / 31 / 2; caller is user 1 in workspace 7. Baseline is a mirror of the pre-edit `deals.js` + `contacts.js` (`deals-baseline/`, no `utils/workspace-refs.js`).

```
BASELINE (pre-edit)                                                      LIVE
  FAIL D1 GET /   all four joins scoped               scoped=[]           ok  scoped=[c,s,ps,u]
  FAIL D2 GET /:id all four joins scoped              scoped=[]           ok  scoped=[c,s,ps,u]
  FAIL D3 POST foreign contact_id -> 400, no INSERT   201, 1 write        ok  400 "contact_id does not belong to this workspace", 0 writes
  FAIL D4 foreign supplier/pipeline/stage/assignee    7/7 accepted        ok  7/7 rejected, 0 writes
          on POST, PUT, PATCH /stage -> 400           (201/200, 1 write each)
  ok   D5 own ids -> 201/200; INSERT/UPDATE params byte-identical;        ok
          omitted ids still written as null
  FAIL D6 one lookup bound to supplied ids only       no lookup           ok  [7,[],[20],[],[]]; none when nothing supplied
          ([7,[],[20],[],[]]); skipped when none
  ok   D7 list rows / detail {...deal, objects} / {id} / {success:true}   ok
  2/7                                                                     7/7
```

D5 and D7 pass on both sides by design: they are the parity assertions (same params, same shapes).

**Regression:** `contacts-refs-test.js` 20/20 with the moved helpers (query text and messages unchanged). Full sweep: admin-console-path 26/26, admin-invites-console 12/12, admin-logout 5/5, admin-session 7/7, analytics-sqli 6/6, analytics-winloss 4/4, chat-ack-client 10/10, chat-ack-server 14/14, chat-http-limit 17/17, chat-import-batch 12/12, chat-import-lowercase 7/7, chat-ip-backstop 10/10, chat-quota-order 10/10, chat-ratelimit 10/10, chat-spam 8/8, contacts-counts 6/6, contacts-refs 20/20, contacts-response 6/6, deals-refs 7/7, type-confusion 9/9. `ratelimit-bypass-test.js` A1/B1 are the Part 2 control columns; `chat-client-ratelimit` / `chat-pending-invariant` are the harnesses retired in Part 13 — both unchanged status. `node --check` passes on the three files. `git diff --quiet db.js`: untouched.

**Not runnable here (real Postgres):** a deal already pointing at another workspace's contact now lists with `contact_name/contact_email/contact_phone` NULL; editing it to keep that id returns 400.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `utils/workspace-refs.js` | 1–70 (new) | `workspaceRefs` (moved verbatim, 12–22), `dealRefs` (29–52), `REF_FIELDS` + generalised `refCheck` (55–68) |
| `routes/contacts.js` | 6–8 | Inline helpers (old 9–34) replaced by `require('../utils/workspace-refs')` |
| `routes/deals.js` | 6–9 | Import `dealRefs`, `refCheck` |
| `routes/deals.js` | 13–16 | `foreignRef(workspaceId, ids)` — lookup + check, returns message or null |
| `routes/deals.js` | 39–42, 59–62 | List and detail joins: `AND <alias>.workspace_id = d.workspace_id` on `c`, `s`, `ps`, `u` |
| `routes/deals.js` | 79–80 | POST: 400 on a foreign id before the INSERT |
| `routes/deals.js` | 100–101 | PUT: 400 on a foreign id before the UPDATE |
| `routes/deals.js` | 118–119 | `PATCH /:id/stage`: 400 on a foreign `stage_id` |

`db.js`, `server.js`, `routes/analytics.js`, `public/*`, `private/*` unchanged since Part 21. Part 22 totals: `routes/deals.js` +23 / −8; `routes/contacts.js` +3 / −27; `utils/workspace-refs.js` +70 (new).

---

## Part 23 — Analytics page: sections destroyed on every load (corrects Part 21's diagnosis)

**Reported:** after Part 21, `Unhandled Promise Rejection: TypeError: null is not an object (evaluating 'el.innerHTML = d.by_pipeline.map(…'` at `switchPage (auth.js:385)`.

### Root cause

`public/js/analytics.js` `loadAnalytics()` began with

```js
const mainSections = document.getElementById('analytics-main-sections');
if (mainSections) mainSections.innerHTML = '';     // "Clear UI immediately to prevent showing stale data"
```

added in **6d197a7** ("fix data cache", 2026-07-20). The four analytics sections (`analytics-sec-stats`, `-winloss`, `-pipeline`, `-trends`) are static children of that container in `index.html:500–529`. Emptying it **destroys them**. `renderAllSections` (from **330d40b**, 2026-05-25) then reorders by `getElementById('analytics-sec-…')` + `appendChild`, finds nothing, appends nothing, and every later lookup inside those sections returns null. `renderAnalyticsCards` guarded (`if (!el) return`), `renderWinLoss` threw, `renderByPipeline` threw.

**Correction to Part 21.** The stale id in `renderWinLoss` was real (git shows the rename), but it was not the whole story: with the correct id the node was still gone, because this line had already destroyed it. Part 21's `if (!section) return` guard therefore let the page proceed to the *next* unguarded lookup, which is this report. Part 21's inference that "the render only runs after a successful fetch, so `/summary` returned 200" still holds. The clearing was intended to avoid showing stale numbers during a fetch; that need is met anyway because every render overwrites the dynamic content when the new data lands.

### What changed — `public/js/analytics.js` only

1. **Removed the clearing** (old `:31–32`). Sections are moved by `appendChild`, which relocates an existing node and never duplicates, so the reorder is idempotent and the markup survives.
2. **`renderByPipeline`**: `if (!el) return;` — same degrade-don't-throw guard the other renders have.
3. **`initSectionDragDrop`**: bind once per section (`data-dnd-bound`). Section nodes now persist across visits; a second set of listeners would apply every drop twice (`splice` twice → the move reverts). Card and trend listeners are unaffected: those nodes are rebuilt via `innerHTML` on every render.

### Verification — `analytics-sections-test.js`

jsdom, the **real `index.html`** (17 script tags not executed) and the real `analytics.js`; `api.get` stubbed per URL with a summary fixture (1 pipeline, 2/1/1 won/lost/open, `value_field` set) and a 7-point trend; `loadAnalytics()` awaited, then a tick to catch the un-awaited `loadTrend`, with `unhandledRejection` captured. Baseline is the Part 21 file (`analytics-sections-baseline.js`).

```
BASELINE (Part 21 file)                                                LIVE
  FAIL S1 loadAnalytics() resolves, no unhandled rejection   TypeError    ok  clean
  FAIL S2 4 sections present; 1 pipeline row, 3 wl segments, sections=[]  ok  [stats,winloss,pipeline,trends]
          6 stat cards rendered                              0/0/0            rows=1 segments=3 cards=6
  FAIL S3 second load: still 4 sections, re-rendered         TypeError    ok  clean, 4 sections
  FAIL S4 stored section_order -> DOM order                  TypeError    ok  [trends,pipeline,stats,winloss]
  FAIL S5 after 2 loads, one drop stats→winloss moves once   sections     ok  winloss,stats,pipeline,trends
          (listeners bound once)                             missing
  0/5                                                                     5/5
```

S5's assertion reads the DOM order after the drop (a harness change from an initial `sectionOrder` read, which jsdom's eval scope does not expose — a harness fix, not a code change). Part 21's `analytics-winloss-test.js` still 4/4. Full sweep: admin-console-path 26/26, admin-invites-console 12/12, admin-logout 5/5, admin-session 7/7, analytics-sections 5/5, analytics-sqli 6/6, analytics-winloss 4/4, chat-ack-client 10/10, chat-ack-server 14/14, chat-http-limit 17/17, chat-import-batch 12/12, chat-import-lowercase 7/7, chat-ip-backstop 10/10, chat-quota-order 10/10, chat-ratelimit 10/10, chat-spam 8/8, contacts-counts 6/6, contacts-refs 20/20, contacts-response 6/6, deals-refs 7/7, type-confusion 9/9; `ratelimit-bypass` A1/B1 are the Part 2 control columns and the two Part 13-retired chat harnesses are unchanged. `node --check` passes. `db.js` untouched.

**Not runnable here:** in the browser, the analytics page should now show all four sections on first visit and after navigating away and back, and section drag-reorder should move a section exactly once per drop.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `public/js/analytics.js` | 31–35 | Clearing of `#analytics-main-sections` removed; comment explains why |
| `public/js/analytics.js` | 161–162 | `initSectionDragDrop`: bind listeners once per section (`dataset.dndBound`) |
| `public/js/analytics.js` | 245 | `renderByPipeline`: `if (!el) return;` |

`db.js`, `server.js`, `routes/*`, `private/*`, `public/index.html` unchanged since Part 22. Part 23 totals: `public/js/analytics.js` +9 / −3 (vs the Part 21 file).

---

## Part 24 — M2: object link endpoints detach/attach without ownership checks

**Hole.** In `routes/objects.js`, `DELETE /:id/deals/:dealId` (old `:104`) and `DELETE /:id/contacts/:contactId` (old `:139`) deleted link rows by the two ids alone, and `POST /:id/contacts` (old `:127`) inserted by the two ids alone. None checked that the object in the URL belongs to the caller's workspace, nor that the linked deal/contact does, so a member could detach or attach another workspace's links by guessing ids. `POST /:id/deals` (old `:87`) checked the **deal's** workspace but not the **object's** — a member could still link their own deal to a foreign object. Foreign keys are global, so every one of these ids can be another workspace's real row.

### Design

One helper, `ownsLink(workspaceId, objectId, table, linkedId)`, does the check the request asked for in a single round trip (Supabase free plan):

```sql
SELECT EXISTS (SELECT 1 FROM objects   WHERE id=$1 AND workspace_id=$3) AS obj,
       EXISTS (SELECT 1 FROM <table>   WHERE id=$2 AND workspace_id=$3) AS linked
```

`<table>` is an internal literal (`'deals'` | `'contacts'`) chosen by the route, never request input. All four link endpoints call it before their write and return **404** — `Not found` when the object is foreign, `Deal not found` / `Contact not found` when the linked row is — so nothing is inserted or deleted on a mismatch. The deal POST keeps its `Deal not found` message; the object-side check it lacked is added. Write SQL, params and `{success:true}` responses are unchanged. Body validation (`deal_id`/`contact_id required` → 400) still runs first. `db.js` untouched.

### Verification — `objects-links-test.js`

Real `routes/objects.js` behind a fake pool recording every `{sql, params}`; fixture: workspace 7 owns object 40 / deal 50 / contact 60, workspace 8 owns 41 / 51 / 61; caller is workspace 7. Baseline is a mirror of the pre-edit file (`objects-baseline/`).

```
BASELINE (pre-edit)                                                          LIVE
  FAIL O1 DELETE /40/deals/51      foreign deal on own object      200, 1 write  ok  404 Deal not found, 0 writes
  FAIL O2 DELETE /41/deals/50      foreign object, own deal        200, 1 write  ok  404 Not found
  FAIL O3 DELETE /40/contacts/61   foreign contact on own object   200, 1 write  ok  404 Contact not found
  FAIL O4 DELETE /41/contacts/60   foreign object, own contact     200, 1 write  ok  404 Not found
  FAIL O5 POST /40/contacts {61}   foreign contact                 201, 1 write  ok  404 Contact not found
  FAIL O6 POST /41/contacts {60}   link to foreign object          201, 1 write  ok  404 Not found
  FAIL O7 POST /41/deals {50}      own deal to foreign object      201, 1 write  ok  404 Not found
  ok   O8 POST /40/deals {51}      foreign deal (already handled)  404           ok  404 Deal not found
  ok   O9 own/own on all four: 201/200, write SQL+params and {success:true} unchanged   ok  4/4
  ok   O10 missing deal_id / contact_id -> 400 before any query                          ok
  3/10                                                                          10/10
```

O8–O10 pass on both sides by design: O8 is the one case the old code already handled, O9/O10 are the parity assertions.

**Regression sweep:** admin-console-path 26/26, admin-invites-console 12/12, admin-logout 5/5, admin-session 7/7, analytics-sections 5/5, analytics-sqli 6/6, analytics-winloss 4/4, chat-ack-client 10/10, chat-ack-server 14/14, chat-http-limit 17/17, chat-import-batch 12/12, chat-import-lowercase 7/7, chat-ip-backstop 10/10, chat-quota-order 10/10, chat-ratelimit 10/10, chat-spam 8/8, contacts-counts 6/6, contacts-refs 20/20, contacts-response 6/6, deals-refs 7/7, objects-links 10/10, type-confusion 9/9; `ratelimit-bypass` A1/B1 are the Part 2 control columns and the two Part 13-retired chat harnesses are unchanged. `node --check` passes. `git diff --quiet db.js`: untouched.

**Not runnable here (real Postgres):** `EXISTS` returns a real boolean; a non-integer id in the URL still surfaces as the pre-existing 500 that every `/:id` route in this file has (out of scope here).

### Files and lines

| File | Lines | Change |
|---|---|---|
| `routes/objects.js` | 8–19 | `ownsLink(workspaceId, objectId, table, linkedId)` — one-query two-sided ownership probe |
| `routes/objects.js` | 104–106 | `POST /:id/deals`: object check added (deal check kept, now via the helper) |
| `routes/objects.js` | 117–119 | `DELETE /:id/deals/:dealId`: 404 on either side before the DELETE |
| `routes/objects.js` | 145–147 | `POST /:id/contacts`: 404 on either side before the INSERT |
| `routes/objects.js` | 158–160 | `DELETE /:id/contacts/:contactId`: 404 on either side before the DELETE |

`db.js`, `server.js`, other `routes/*`, `public/*`, `private/*` unchanged since Part 23. Part 24 totals: `routes/objects.js` +25 / −5.

---

## Part 25 — C3b / S-02: stored XSS in notes and comments

**Hole.** Notes are HTML from a `contenteditable` editor, stored verbatim (`routes/activities.js` POST/PATCH, `routes/activity-comments.js` POST) and put back with `innerHTML` in `public/js/modals.js` (`:373`, `:419` edit modals; `:823` deal timeline; `:937` inline editor). A planted `<img onerror>` runs in every colleague's session that opens the contact. No sanitizer existed; `esc()` is used for comments and chat but not notes, because notes legitimately carry formatting. Two more sinks of the same class: `truncateActivityPreview` (`modals.js:222`) and calendar's `stripHtml` (`calendar.js:82`) both did `div.innerHTML = html` on a *detached* element — `<img onerror>` still loads and fires there.

### Dependency added

**`sanitize-html@2.17.7`** — `package.json` `"sanitize-html": "^2.17.7"`, `package-lock.json` +232 lines. Transitive: `htmlparser2`, `postcss`, `deepmerge`, `launder`, `parse-srcset`, `is-plain-object`, `escape-string-regexp`. **No jsdom** (that was the reason to avoid isomorphic-dompurify). Engines: **node ≥ 22.12.0** — local is 22.19.0; the host must be at least 22.12.

### The two decisions asked for

1. **Rows saved before the fix are not rewritten.** Per your note that existing notes are already HTML and must stay, there is no SQL cleanup. Instead the client sanitises again at render time with the same allow-list: every place that puts note HTML into the page passes it through `sanitizeNoteHtml()` first, so an old poisoned row is neutralised the moment it is displayed and keeps its bold/lists/links. Write-side sanitising stops new poison from being stored at all.
2. **CSP.** `server.js:44–46` enables helmet's CSP only when `NODE_ENV === 'production'`. Nothing in the repo sets it: `.env` has no `NODE_ENV` line, `.env.example` none, the start script is `node --env-file=.env server.js`, and there are no deploy manifests. I cannot see the host. **Unless the host's own environment sets `NODE_ENV=production`, there is no CSP today.** Setting it there (or in `.env`) is a config change on your side; nothing in this part changes `server.js`.

### Design

**Server — `utils/sanitize-note.js` (new).** `sanitizeNote(html)` = sanitize-html with `allowedTags: b, i, u, strong, em, a, br, p, ul, ol, li`, `allowedAttributes: { a: ['href'] }`, `allowedSchemes: http, https, mailto`, `allowProtocolRelative: false`, and `transformTags: { div: 'p' }`. The last is deliberate: the editor emits `<div>` for every Enter (`_countNoteLines` counts `</div>` as a line break); discarding `div` would keep the text but merge every line of every note into one paragraph. Mapping it onto the allowed `<p>` keeps line structure without widening the allow-list. Everything else — `img`, `script`, `style`, `span`, event-handler attributes, `javascript:` hrefs — is dropped; text inside `script`/`style` goes with the tag. Known cosmetic effect: Safari's bold is `<span style="font-weight:bold">`, which becomes plain text.

- `routes/activities.js` POST: content sanitised before both the INSERT and mention detection; a note that sanitises to nothing (e.g. only a `<script>`) is the existing 400 `Content required`. PATCH: absent stays absent (COALESCE keeps the old note); a supplied value is sanitised; the pre-existing behaviour for an empty string is unchanged.
- `routes/activity-comments.js` POST: same, sanitised once, used by the INSERT and the mention pass. Comments already render through `esc()`; this is defence in depth as requested.
- Mention detection (`activities.js:11`, `activity-comments.js:10`) is untouched; it strips tags before matching, and sanitising first only removes tags it would have stripped anyway (X5 proves it still fires).

**Client — `public/js/core.js` `sanitizeNoteHtml(html)`** next to `esc()`. DOMParser-based — the parsed document is inert, nothing loads or runs while untrusted markup is parsed — same allow-list; disallowed elements are unwrapped (children kept) except `script`, `style`, `template`, `iframe`, `object`, `embed`, `noscript`, removed whole; `div` → `p`; every attribute dropped except `a[href]` with an `http(s):`/`mailto:` scheme; SVG/MathML tag names are upper-cased before the check so `<svg><script>` cannot slip past. Self-contained (its sets live inside the function) so it does not depend on load order. Used at the four `modals.js` sites and in `truncateActivityPreview`; calendar's `stripHtml` parses with DOMParser. The editor save paths (`innerHTML.trim()`) are unchanged — the server sanitises what they send.

Not touched: `db.js`, response shapes, the editor toolbar, `server.js`.

### Verification — the exact checks requested

**Posting the payload** `<p>Hi <b>bold</b> <a href="https://ok.test">ok</a> <a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)><script>alert(1)</script></p>` — the value bound to the INSERT/UPDATE is:

```
<p>Hi <b>bold</b> <a href="https://ok.test">ok</a> <a>bad</a></p>
```

`onerror`, `<img>`, `<script>` and the `javascript:` href are gone; bold, the https link and the paragraph survive. `<img src=x onerror=alert(1)>` alone becomes `""` → 400. `<div>line1</div><div>line2</div>` → `<p>line1</p><p>line2</p>`.

**`notes-xss-test.js`** (real routes, fake pool records `{sql, params}`; baseline mirror `notes-baseline/`):
```
BASELINE                                                        LIVE
  FAIL X1 POST note stored clean, formatting kept   raw stored    ok
  FAIL X2 PATCH note                                 raw stored    ok
  FAIL X3 POST comment                               raw stored    ok
  FAIL X4 <div> lines -> <p>                         raw           ok  <p>line1</p><p>line2</p>
  ok   X5 @mention in <b>@justin</b> still notifies user 2         ok
  FAIL X6 script-only note -> 400, nothing inserted  201, stored   ok  400
  ok   X7 shapes {id} / {success,id} / comment row                 ok
  2/7                                                              7/7
```

**Re-rendering a note saved before the fix — `note-render-xss-test.js`** (jsdom with scripts enabled, real `core.js`; old row = `<b>bold</b><img src=x onerror="window.pwned=2"><a href="javascript:window.pwned=3">link</a><script>window.pwned=1</script><div>line</div>`; the img `error` event is dispatched by hand, as a browser does for `src=x`):
```
BASELINE (pre-edit client)                                                   LIVE
  ok   R1 control: raw innerHTML of the old row runs onerror -> pwned=2      ok  (the sink is real)
  FAIL R2 sanitizeNoteHtml(old row): nothing runs, <b>/link text/line kept   ok  out="<b>bold</b><a>link</a><p>line</p>", pwned undefined
  FAIL R3 modals.js 0 raw ${…content} sites / 4 wrapped; preview+stripHtml   ok  raw=0 wrapped=4
          no longer parse through a live div                 raw=4 wrapped=0
  1/3                                                                         3/3
```

Full sweep: all previously green harnesses unchanged (admin ×4, analytics ×3, chat ×9 live, contacts ×3, deals-refs 7/7, objects-links 10/10, type-confusion 9/9) plus notes-xss 7/7 and note-render-xss 3/3; `ratelimit-bypass` A1/B1 are the Part 2 controls and the two Part 13-retired chat harnesses are unchanged. `node --check` passes on all six files. `git diff --quiet db.js`: untouched.

**Not runnable here:** a real browser fires `error` for `src=x` itself; jsdom needed the dispatch. And the Safari `<span>` bold → plain-text effect above is worth a glance if your team uses Safari.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `package.json`, `package-lock.json` | — | `sanitize-html@2.17.7` |
| `utils/sanitize-note.js` | 1–25 (new) | `sanitizeNote()` allow-list, `div→p` |
| `routes/activities.js` | 5–7 | require |
| `routes/activities.js` | 100–102 | POST: sanitise before INSERT + mentions; empty after sanitising → 400 |
| `routes/activities.js` | 135–137 | PATCH: sanitise a supplied value, absent stays absent |
| `routes/activity-comments.js` | 5 | require |
| `routes/activity-comments.js` | 101–105 | POST: sanitise once; used by INSERT and mention pass |
| `public/js/core.js` | 198–230 | `sanitizeNoteHtml()` (DOMParser, inert, same allow-list) |
| `public/js/modals.js` | 224 | `truncateActivityPreview` parses sanitised HTML |
| `public/js/modals.js` | 373, 419, 823, 937 | `${sanitizeNoteHtml(…content)}` at every render site |
| `public/js/calendar.js` | 82–85 | `stripHtml` via DOMParser |

`db.js`, `server.js`, other `routes/*`, `private/*` unchanged since Part 24. Part 25 totals: `routes/activities.js` +9 / −3; `routes/activity-comments.js` +7 / −3; `public/js/core.js` +33 / −0; `public/js/modals.js` +5 / −5; `public/js/calendar.js` +2 / −3; `utils/sanitize-note.js` +25 (new); `package.json` +1; `package-lock.json` +232.

---

## Part 26 — M1/M3 (SR-4): tasks, objects, activities, comments, calendar — unscoped joins, unvalidated refs, unvalidated status/priority

**Hole.** Same class as Part 22, in four more files. `routes/tasks.js` joined `users`/`deals`/`contacts` on raw ids (list, detail, subtasks), the subtask query was `WHERE t.parent_id=$1` with no workspace filter, the two `subtask_count`/`subtask_done` subqueries counted across workspaces, POST/PUT validated `deal_id`/`contact_id` but wrote `parent_id`, `project_id`, `list_id`, `assigned_to` straight from the body, and `status`/`priority` were written unvalidated (PUT, `PATCH /:id/status`). `objects.js`, `activities.js`, `activity-comments.js`, `calendar.js` had the same unscoped `users`/`contacts` joins. FKs are global, so a `parent_id` pointing across workspaces rendered a foreign task inside my subtask list — shown live below.

### Findings that shaped it

- **Valid status is not only `workspaces.task_statuses`.** The client (`public/js/tasks.js:19–22`) uses the task's *project* statuses (`task_project_statuses`) when the project has any, else a hard-coded default list identical to the column default (`todo, in_progress, in_review, done`). Validating against the column alone would 400 every task in a project with custom statuses. So valid = column keys ∪ the task's project keys ∪ the four built-ins, in one query (`allowedTaskStatuses`). PUT uses the body's `project_id` (after it passes the refs check); PATCH uses the task's stored `project_id`.
- **Priority allow-list:** `low, medium, high, urgent` — the exact `<option>` values in `index.html:468–471`, `:1409–1412`.
- `objects.js:55` / `:132` (`JOIN contacts … WHERE … c.workspace_id = $2`) were already scoped in the WHERE and are left as they are. `objects.js:46–48` also joined `pipeline_stages`/`pipelines` unscoped — same class, scoped in passing.

### Design

**`utils/workspace-refs.js`** (extended; `dealRefs` and `workspaceRefs` untouched — `deals-refs-test` 7/7 and `contacts-refs-test` 20/20 unchanged prove it):
- `taskRefs(q, wid, { parent_id, project_id, list_id, assigned_to, deal_id, contact_id })` — one round trip, only supplied ids, `= ANY($n::int[])` over `tasks`, `task_projects`, `task_lists`, `users`, `deals`, `contacts`. Non-integer ids are not looked up → 400 (the old `parseInt('12abc')→12` leniency for deal/contact is gone).
- `REF_FIELDS` gains `parent_id`, `project_id`, `list_id`, `deal_id` with `"<field> does not belong to this workspace"`. `refCheck` still checks a field only when `refs` carries that set, so the contacts and deals paths are unchanged.
- `allowedTaskStatuses(q, wid, projectId)`, `TASK_PRIORITIES`.

**`routes/tasks.js`:** every join scoped (`AND x.workspace_id = t.workspace_id` on `u`, `cu`, `dl`, `ct`); both count subqueries `AND s.workspace_id = t.workspace_id`; subtasks `WHERE t.parent_id = $1 AND t.workspace_id = $2`. POST/PUT: one `taskRefs` + `refCheck` covering all six ids → 400 before the write (replaces the two per-field deal/contact queries — one round trip instead of up to two; messages become the shared text, `{error}` shape unchanged). Status/priority: POST defaults `todo`/`medium` then validates; PUT requires a valid `status` (a missing one used to be a 500 from NOT NULL) and defaults `priority` to `medium`; `PATCH /:id/status` looks up the task's own `project_id` (404 if not mine) and validates against it. `Invalid status` / `Invalid priority` → 400.

**Join predicates elsewhere** (`AND <alias>.workspace_id = <base>.workspace_id`): `objects.js:46–48` (`ps`, `c`, `p`); `activities.js:43, 89–90, 125`; `activity-comments.js:31, 76, 125`; `calendar.js:19, 44`. The two mention lookups (`activities.js:44`, `activity-comments.js:32`) additionally take `AND a.workspace_id = $2`.

Not touched: `db.js`, response shapes, `task-projects.js`, the client.

### Verification — real Postgres, baseline first

**`tasks-scope-pg-test.js`** runs the **real router against a real local PostgreSQL 16** (Homebrew, `localhost:5432`): a throwaway database `crm_verify_p26` built by the project's own `initDb()` with `DATABASE_URL` overridden for the harness process only (`DATABASE_SSL=false`, local server has no SSL). Supabase was never touched; the database was dropped afterwards. Fixture: workspace 7 (user 1, task 100 in project 20 which has a custom status `qa`, list 30, deal 50, contact 60); workspace 8 (user 2, **task 101 with `parent_id = 100`** — cross-workspace, FK-valid — project 21, list 31, deal 51, contact 61). Caller is user 1 / workspace 7.

```
BASELINE (pre-edit tasks.js)                                                     LIVE
  FAIL T1 GET /100: foreign task 101 among subtasks        subtasks=[101]       ok  subtasks=[]
  FAIL T2 GET /: subtask_count for 100                     1                    ok  0
  FAIL T3 foreign assigned_to / parent_id / project_id /   POST 201 + row       ok  11/11 -> 400, nothing written
          list_id / deal_id / contact_id on POST and PUT   PUT 200 + WROTE
  FAIL T4 status 'bogus' on PUT / PATCH; priority 'asap'   200 / 200 / 200      ok  400 / 400 / 400
          project key 'qa' and built-in 'in_review'        row = todo/asap          'qa' 200, 'in_review' 200, row = in_review/medium
  ok   T5 own ids 201/200; {id}, {success:true}, {...task, subtasks}, list row keys unchanged   ok
  1/5                                                                             5/5
```

**EXPLAIN (COSTS OFF)** of the SQL exactly as shipped in `routes/tasks.js` (extracted from the file, run by the real planner):

Subtask query — before:
```
Sort
  Sort Key: t.created_at
  ->  Hash Right Join
        Hash Cond: (u.id = t.assigned_to)
        ->  Seq Scan on users u
        ->  Hash
              ->  Seq Scan on tasks t
                    Filter: (parent_id = 100)
```
Subtask query — after:
```
Sort
  Sort Key: t.created_at
  ->  Nested Loop Left Join
        Join Filter: (u.id = t.assigned_to)
        ->  Seq Scan on tasks t
              Filter: ((parent_id = 100) AND (workspace_id = 7))
        ->  Index Scan using users_workspace_id_email_key on users u
              Index Cond: (workspace_id = 7)
```
List query — after (the two count subplans; before, both read `Filter: (parent_id = t.id)` only):
```
SubPlan 1
  ->  Aggregate
        ->  Seq Scan on tasks s
              Filter: ((parent_id = t.id) AND (workspace_id = t.workspace_id))
SubPlan 2
  ->  Aggregate
        ->  Seq Scan on tasks s_1
              Filter: ((parent_id = t.id) AND (workspace_id = t.workspace_id) AND (status = 'done'::text))
```
and every join in the list plan now carries `workspace_id = 7` on `users u`, `users cu`, `deals dl`, `contacts ct` (the planner pushed the join predicate into each scan). The full plans are in the harness output.

**`scope-joins-test.js`** (static): all 20 `users`/`contacts`/`pipeline_stages`/`pipelines` joins across the five routes carry a workspace predicate (on the JOIN or in the enclosing WHERE); subtask query and both count subqueries scoped. Baseline 0/2 (18 unscoped joins listed), live 2/2.

**Regression sweep:** every earlier harness unchanged — including deals-refs 7/7 and contacts-refs 20/20 (shared helper untouched for them), objects-links 10/10, notes-xss 7/7, note-render-xss 3/3; `ratelimit-bypass` A1/B1 are the Part 2 controls and the two Part 13-retired chat harnesses are unchanged. `node --check` passes on all six files. `git diff --quiet db.js`: untouched.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `utils/workspace-refs.js` | 51–76 | `taskRefs()` — six-table single lookup |
| `utils/workspace-refs.js` | 77–92 | `TASK_PRIORITIES`, `BUILTIN_TASK_STATUSES`, `allowedTaskStatuses()` |
| `utils/workspace-refs.js` | 105–108, 118 | `REF_FIELDS` + exports |
| `routes/tasks.js` | 6–8 | require |
| `routes/tasks.js` | 25–31 | list: scoped count subqueries and four joins |
| `routes/tasks.js` | 45–47 | detail: three joins scoped |
| `routes/tasks.js` | 55–58 | subtasks: join scoped, `AND t.workspace_id = $2` |
| `routes/tasks.js` | 67–76 | POST: refs check, status/priority validation |
| `routes/tasks.js` | 99–110 | PUT: refs check, status required + validated, priority validated |
| `routes/tasks.js` | 127–131 | PATCH /status: task's project resolved, status validated |
| `routes/objects.js` | 46–48 | `ps`, `c`, `p` joins scoped |
| `routes/activities.js` | 43–44, 89–90, 125 | joins scoped; mention lookup takes workspace |
| `routes/activity-comments.js` | 31–32, 76, 125 | joins scoped; mention lookup takes workspace |
| `routes/calendar.js` | 19, 44 | contacts joins scoped |

`db.js`, `server.js`, `public/*`, `private/*` unchanged since Part 25. Part 26 totals: `routes/tasks.js` +40 / −32; `routes/objects.js` +3 / −3; `routes/activities.js` +6 / −6; `routes/activity-comments.js` +5 / −5; `routes/calendar.js` +2 / −2; `utils/workspace-refs.js` +49 / −1.

---

## Part 27 — Tasks page ignored the workspace's own task statuses (follow-up to Part 26)

**Finding (from Part 26).** `public/js/tasks.js` `getActiveTaskStatuses()` used the current project's statuses when the project had any, otherwise a hard-coded default list. It never read `currentWorkspace.task_statuses` — the list a workspace owner edits in Settings (`settings.js` reads and saves that column). So workspace-level custom statuses were saved but never offered on the tasks page, and the server's Part 26 rule (workspace column ∪ project statuses ∪ built-ins) validated keys the client could not produce.

### Change — `public/js/tasks.js` only

`getActiveTaskStatuses()` precedence is now: the project's statuses when the project has any → the workspace's `task_statuses` when non-empty → the built-in four. Same precedence the server validates against. Guarded so it cannot throw if `currentWorkspace` is not yet loaded.

### Verification — `task-status-fallback-test.js` (jsdom, real `tasks.js`; baseline from git HEAD, the file was unmodified before this part)

```
BASELINE                                                              LIVE
  FAIL P1 no project: workspace Settings list used   todo,in_progress,…   ok  backlog,shipped
  ok   P2 project's own statuses win                 qa                   ok  qa
  FAIL P3 project with empty list -> workspace list  todo,in_progress,…   ok  backlog,shipped
  ok   P4 no project, empty workspace list -> built-ins                   ok
  ok   P5 nothing loaded -> built-ins, no throw                           ok
  3/5                                                                     5/5
```

`node --check` passes. `db.js` untouched. Server unchanged (Part 26's `allowedTaskStatuses` already accepts these keys — T4 in Part 26 proved a project key and a built-in; the workspace column is part of the same union).

### Files and lines

| File | Lines | Change |
|---|---|---|
| `public/js/tasks.js` | 19–27 | `getActiveTaskStatuses()`: project → workspace `task_statuses` → defaults |

Everything else unchanged since Part 26. Part 27 totals: `public/js/tasks.js` +7 / −2.

---

## Part 28 — Contacts import: `unmatched` counter so the numbers reconcile

**Gap.** A contact deleted between the prefetch and the batch `UPDATE … RETURNING c.id` (the READ COMMITTED window Part 17 closed for correctness) was rightly not counted as imported — but it was counted nowhere, so `submitted ≠ imported + skipped`. Same for the legacy per-row path's `rowCount === 0` branch. A row vanishing mid-import is worth telling the user about.

### Changes

**`routes/contacts.js`** — new `unmatched` counter, appended to the response (`{ imported, deals_created, created, updated, skipped, unmatched }`; the five existing keys and their order unchanged):
- batch UPDATE loop: `unmatched += c.length - matched.length`;
- batch INSERT loop: `unmatched += c.length - inserted.length` — an `INSERT … RETURNING` cannot really come up short, but counting it makes `submitted === imported + skipped + unmatched` an exact identity rather than "true unless the DB misbehaves" (and the Part 17 K4 harness case, whose fake returns 2 of 3 inserted rows, now reconciles instead of contradicting the invariant);
- legacy path: `if (upd.rowCount === 0) { unmatched++; continue; }`.

**`public/js/admin-import.js`** — summary gains, only when `unmatched > 0`: "*N row(s) matched no contact and was/were skipped (deleted during import).*" Same `textContent` sink, no HTML; an older server response without the field leaves the message unchanged.

### Verification — baseline first

**`contacts-counts-test.js`** (Part 17's harness, extended): an `identities(id, body, submitted)` assertion — `submitted === imported + skipped + unmatched` and `imported === created + updated` — added to every existing case, plus K7 (mixed run with a row deleted mid-import) and K8 (key set). Baseline mirror `counts-baseline/`.

```
BASELINE (pre-edit)                                                          LIVE
  ok   K1–K5 (Part 17 assertions)                                           ok
  FAIL K1i–K5i identities (unmatched undefined -> reconcile fails)           ok
  FAIL K7 5 submitted, contact 501 deleted mid-import                        ok  imported 3 (1 updated + 2 created), skipped 1, unmatched 1
  FAIL K8 keys                                                               ok  imported,deals_created,created,updated,skipped,unmatched; unmatched 0 when nothing vanished
  6/14                                                                        14/14
```

The three identities, shown with a row deleted mid-import (live K7i):
```
5 submitted = 3 imported + 1 skipped + 1 unmatched
3 imported  = 2 created  + 1 updated
```
and in the legacy path (K3i): `2 submitted = 0 imported + 0 skipped + 2 unmatched`; batch UPDATE with one deleted (K1i/K2i): `2 = 1 + 0 + 1`; nothing deleted (K5i): `5 = 5 + 0 + 0`.

**`admin-import-summary-test.js`** — the message-building lines sliced out of the shipped file and evaluated on server responses: U1 `unmatched 1` → "1 row matched no contact and was skipped (deleted during import)."; U2 `unmatched 0` → no such sentence, existing wording intact; U3 plural; U4 old response without the field → unchanged, no throw. Baseline 2/4 (U1, U3 fail), live 4/4.

**Harness literal-match updates (not logic):** Part 18's `chat-import-batch-test.js` T11 and Part 19's `contacts-response-test.js` S5 assert the exact key set; both now include `unmatched`. Full sweep otherwise unchanged (all earlier harnesses green; `ratelimit-bypass` A1/B1 Part 2 controls; two Part 13-retired chat harnesses). `node --check` passes. `db.js` untouched.

### Files and lines

| File | Lines | Change |
|---|---|---|
| `routes/contacts.js` | 131–132 | `let unmatched = 0` |
| `routes/contacts.js` | 194 | batch UPDATE: `unmatched += c.length - matched.length` |
| `routes/contacts.js` | 217 | batch INSERT: shortfall counted (identity kept exact) |
| `routes/contacts.js` | 256 | legacy path: `rowCount === 0` → `unmatched++` |
| `routes/contacts.js` | 283–286 | response: `unmatched` appended |
| `public/js/admin-import.js` | 248 | summary sentence when `unmatched > 0` |

Everything else unchanged since Part 27. Part 28 totals: `routes/contacts.js` +12 / −7; `public/js/admin-import.js` +1 / −0.

---

## Part 29 — Test suite moved into the repository (`tests/`)

**Why.** The 31 harnesses that proved Parts 1–28 lived in a temporary scratchpad and would have been lost. They are now a proper suite in `tests/`, runnable with `npm test`, using Node 22's built-in `node:test` runner. **No dependency was added** to `package.json`; the only change there is the `test` script. `express` (already a dependency) is reused for the route tests; the browser-side tests skip themselves with a printed reason unless `jsdom` is installed as a dev dependency (`npm i -D jsdom`), which was verified to work by borrowing jsdom from the scratchpad without installing it in the repo.

### Layout

```
tests/README.md                 — plain-language explanation: what a test is, the three kinds, how the fake pool and require.cache swap work, reading output, adding a test, gotchas
tests/helpers/fake-pool.js      — records every SQL + params; answers from regex rules
tests/helpers/load-route.js     — loads a REAL route with db / auth / notifications swapped; serves it on a random port with a request() helper
tests/helpers/dom.js            — optional jsdom; exports skipOpts for describe()
tests/unit/       sanitize-note, workspace-refs, chat-rate-limit, admin-console
tests/routes/     deals, objects, analytics, activities, contacts-import, tasks
tests/client/     analytics-page, note-sanitizer, task-statuses   (skip without jsdom)
```

### Result

```
npm test                    tests 85  pass 85  fail 0   (3 client suites: # SKIP jsdom is not installed …)
client with jsdom present   tests 11  pass 11  fail 0
```

Coverage mirrors the session's harnesses: sanitiser allow-list and `div→p`; `refCheck`/`dealRefs`/`taskRefs` bind shapes and skip-when-empty; chat limiter window/per-user/middleware order; console-path rules; deals and tasks scoped joins + foreign-id rejection with no write + identical write parameters; object-link two-sided ownership; analytics payload-only-in-params + typed guard + allow-list + key sets; notes sanitised on write with mentions intact; import counts from `RETURNING` with both identities on every case and the 2 001-row 413; analytics page load/revisit/order/drop-once; render-side sanitiser with the executing control; task status precedence.

One runner quirk found and documented: `describe(name, { skip: null })` still skips in Node's runner — the helper now passes `{}` when jsdom is present.

### Files

| File | Change |
|---|---|
| `package.json` | `"test": "node --test \"tests/**/*.test.js\""` (scripts only) |
| `tests/**` | 17 new files (3 helpers, 13 test files, README) |

`db.js`, `server.js`, `routes/*`, `utils/*`, `public/*`, `private/*` unchanged since Part 28.

---

## Part 36 — Test-suite consistency pass (no application code changed)

**Why.** A read-only audit of `tests/` (24 files) found fixtures copied between files, three real defects in tests, a migration "baseline" that no longer proved anything, a database test that would wipe whatever `TEST_DATABASE_URL` pointed at, and docs that had drifted. Parts 30–35 (the six bug fixes found by the same review) follow separately. Numbering: 30–35 are reserved for those; this pass is 36.

### Shared helpers (new)
| File | Replaces |
|---|---|
| `tests/helpers/fake-tables.js` — `idempotencyTable()`, `apiKeyRules(KEY)` | three copies of the in-memory `idempotency_keys` model (one with a wrong reply shape) and three copies of the `api_keys` lookup rule |
| `tests/helpers/fake-http.js` — `fakeReq()`, `fakeRes()` | three differently-shaped hand-rolled req/res objects |
| `tests/helpers/schema-constants.js` | the seven statuses, eleven columns, four tables, pre-Stage-1 table list, indexes — hard-coded in five places |
| `tests/helpers/skip.js` — `skipUnless(cond, reason)` | two hand-rolled `skipOpts` |
| `fake-pool.js` `writes()`, `someParam()`; `load-route.js` `request(method, path, body, headers)`, `closeAllConnections()`, `inject()` returns `restore()` | per-file `writes()`, a local `fetchJson`, a hand-built server, unrestored cache entries |

### Defects fixed in tests
- `routes/engine-api.test.js`: an assertion sat inside a `//` comment and never ran (the "untouched when absent" half of the `drive_ordner_id` test). Now on its own line, and the UPDATE is located by content instead of log index.
- `routes/contacts-import.test.js`: deal ids compared after a **lexicographic** `.sort()` — passed only because of digit counts. Numeric sort, expectation reordered.
- `unit/db-migrations.test.js`: `find(...) || ''` turned a missing statement into a confusing regex diff → `must(re, what)`; `/plz TEXT$/` end anchor → `\b`; DROP/ADD adjacency → ordering only; the destructive-keyword scan scoped to `ALTER TABLE`/`DROP TABLE`.
- `unit/server-wiring.test.js`: `exec(src)[0]` threw a bare `TypeError` on a non-match → asserts the match first.
- `client/ui-onboarding.test.js` (moved from `unit/`, it needs jsdom for one block): the handler loop could pass with zero iterations; a `> 15` magic threshold → the explicit list of keys the cards must carry.
- `routes/deals.test.js` / `routes/tasks.test.js`: `Array.isArray` checks that could not fail → canned linked-object / subtask rows with asserted contents (the subtask row now comes from the scoped `parent_id` query).
- `unit/engine-webhook.test.js`: a never-settling promise left behind by the overlap-guard test is now released and awaited; a float `20.6` restatement dropped.
- `routes/engine-settings.test.js` / `routes/objects.test.js`: full-clause fake-pool regexes → stable prefixes (README §3.4); the retry clamp is now asserted on the SQL text rather than on the fake; `x === undefined` on possibly-absent objects → `in` checks.
- `unit/engine-auth.test.js`: `setTimeout(5)` replaced by polling for the stamp; the plain key is checked via `pool.someParam`.

### Baseline made real
The migration test's "before" was `HEAD:db.js`, which already contained Stage 1 — it proved nothing. `tests/fixtures/db.pre-stage1.js` (= `git show 5e9d187:db.js`, 481 lines, no `onboarding_status`) is now the baseline for both `npm run test:baseline` and the real-Postgres test, which additionally asserts the fixture lacks the column before migrating.
```
test:baseline   4 additive/regression guards pass, 11 Stage 1 assertions fail — as designed
```

### Database test safety
`tests/db/onboarding-schema.pg.test.js` → `tests/db/onboarding-schema.test.js`. It drops the public schema, so it now runs only when `TEST_DATABASE_URL` is local (`localhost`/`127.0.0.1`/`::1`) **and** `ALLOW_DESTRUCTIVE_DB_TEST=1`; otherwise it skips with the exact reason. Verified: remote host → refused; local without opt-in → refused; local with opt-in on a throwaway `crm_stage1` → 6/6, database dropped afterwards. (A constant named `URL` had shadowed the global `URL` class — caught by this verification and fixed.)

### Scripts / engines
`package.json`: `test:unit`, `test:routes`, `test:client`, `test:db`, `test:baseline`, `test:serial` (`--test-concurrency=1`); `"engines": { "node": ">=22" }` (the `--test` glob needs Node 22).

### Conventions applied to touched files
`describe` when > 4 tests; one assertion per line; a message on bare status checks; `// <KIND> tests for <subject>` headers.

### Docs
`tests/README.md` rewritten: four kinds incl. `db/`, the scripts, `TEST_DATABASE_URL` / `ALLOW_DESTRUCTIVE_DB_TEST` / `DB_FILE`, nested name-pattern note, house rules, coverage table regenerated from the files (24), concrete counts removed from the sample. `tests/HOW_EACH_TEST_WORKS.md`: Part F for the helpers and the eleven files it did not cover; three misquotes corrected.

```
npm test   tests 176  pass 176  fail 0   (was 175: the loop-prevention test split into two)
```
`routes/*`, `utils/*`, `middleware/*`, `db.js`, `server.js`, `public/*`: unchanged in this part (`git status` shows only `tests/` and `package.json`).

---

## Part 30 — Task-project statuses readable and replaceable across workspaces

**Hole.** `routes/task-projects.js` `GET /:id/statuses` and `PUT /:id/statuses` ran `SELECT … WHERE project_id=$1` and `DELETE FROM task_project_statuses WHERE project_id=$1` + inserts with **no workspace check**. `task_project_statuses` has no `workspace_id` of its own; the project decides. Any member of any workspace who guessed a project id could read that workspace's status list, and with PUT wipe it and replace it with their own.

**Fix.** `ownProjectId(req)` (line 154): `:id` must be all digits, then `SELECT id FROM task_projects WHERE id=$1 AND workspace_id=$2`; no row → `404 Not found` before any read or write. Every statement is keyed on the verified id. Body validation (`statuses` must be an array → 400) still runs first.

**Verification — `tests/routes/task-projects-statuses.test.js`** (fake pool; baseline = pre-fix mirror via `TEST_APP_ROOT`):
```
BASELINE                                                              LIVE
  FAIL GET foreign project -> 404, statuses never read      200 leak   ok
  ok   GET own project -> its statuses                                 ok
  FAIL GET /abc -> 404 without a query                                 ok
  FAIL PUT foreign project -> 404, zero writes, their list intact      ok   (baseline: 200, DELETE+INSERT on their project)
  FAIL PUT own -> DELETE + INSERTs keyed on the verified id, in order  ok
  ok   PUT non-array -> 400 before any lookup                          ok
  2/6                                                                  6/6
```
Files: `routes/task-projects.js` +16 / −3 (lines 150–188).

---

## Part 31 — Deal ↔ object links unchecked on either end

**Hole.** `routes/deals.js` `GET/POST/DELETE /:id/objects[/:objectId]` wrote `deal_objects (deal_id, object_id)` straight from the request and read linked objects by deal id alone. `deal_objects` carries no `workspace_id`, and neither the deal nor the object was checked, so a member could attach any object anywhere, detach other workspaces' links, and read another workspace's object rows through their own deal. The object-side twins in `routes/objects.js` were fixed in Part 24; the deal side was not.

**Fix.** New shared `ownsPair(q, wid, ['deals', id], ['objects', id])` in `utils/workspace-refs.js` (line 80): one `EXISTS`/`EXISTS` round trip, table names are route-chosen literals. POST/DELETE: deal foreign → `404 Not found`, object foreign → `404 Object not found`, nothing written. GET: the deal is resolved in the workspace first (404 otherwise) and objects are joined with `o.workspace_id = $2`. Non-numeric ids → 400 (previously a Postgres error → 500). `objects.js` keeps its local `ownsLink` (same idea, different aliases) so Part 24's tests are unchanged.

**Verification — `tests/routes/deals-objects.test.js`:**
```
BASELINE                                                              LIVE
  FAIL GET foreign deal -> 404, objects never read       200 + their object row   ok
  FAIL GET own deal -> rows via o.workspace_id = $2 join                          ok
  FAIL POST foreign deal / own object -> 404, no write   201 + INSERT             ok
  FAIL POST own deal / foreign object -> 404, no write   201 + INSERT             ok
  FAIL DELETE foreign deal -> 404, no write              200 + DELETE             ok
  FAIL DELETE foreign object -> 404, no write            200 + DELETE             ok
  FAIL own + own -> 201 / 200 with the original params   (ids bound as strings)   ok
  FAIL missing / non-numeric ids -> 400, no query        500 / written            ok
  0/8                                                                             8/8
```
Files: `routes/deals.js` +23 / −5 (lines 158–205); `utils/workspace-refs.js` +13 / −1 (`ownsPair`, exported).

---

## Part 32 — Stages could be added to another workspace's pipeline

**Hole.** `routes/pipelines.js` `POST /:id/stages` inserted a stage with the caller's `workspace_id` but the `pipeline_id` from the URL, never checking the pipeline was theirs; the `MAX(position)` probe read the foreign pipeline's positions. Result: a stage row of workspace A inside workspace B's pipeline.

**Fix.** `:id` must be digits (400); `SELECT id FROM pipelines WHERE id=$1 AND workspace_id=$2` → `404 Not found` before the probe; the probe gains `AND workspace_id=$2`; the INSERT binds the verified id (a first pass still bound the raw URL string — caught by the test's exact-params assertion and corrected).

**Verification — `tests/routes/pipelines-stages.test.js`:**
```
BASELINE                                                                  LIVE
  FAIL foreign pipeline -> 404, no INSERT, no probe     201 + INSERT       ok
  FAIL own -> 201, probe scoped [5, 7], INSERT [7, 5, 'Angebot', '#123', 3]  ok
  FAIL missing name / non-numeric id -> 400, no query   (500 on /abc)      ok
  0/3                                                                      3/3
```
Files: `routes/pipelines.js` +8 / −3 (lines 91–103).

---

## Part 33 — Inbound-webhook settings accepted foreign pipeline, stage and assignee

**Hole.** `routes/integrations.js` `PATCH /settings` stored `pipeline_id`, `stage_id` and `default_assignee_id` from the body unchecked. Every lead that later arrives on the **public** `POST /receive/:key` is written using those ids — into another workspace's pipeline, or assigned to a user of another workspace. This is the class of bug `utils/workspace-refs.js` exists for, and the route did not use it.

**Fix.** The existing `dealRefs` + `refCheck` guard (line 60) → `400 "<field> does not belong to this workspace"` (the `assigned_to` wording rewritten to `default_assignee_id`), no UPDATE; when both are given, `stage_id` must belong to `pipeline_id` in this workspace (`SELECT 1 FROM pipeline_stages WHERE id=$1 AND pipeline_id=$2 AND workspace_id=$3`) → 400. Nulls skip the lookup entirely.

**Verification — `tests/routes/integrations-settings.test.js`:**
```
BASELINE                                                                LIVE
  FAIL foreign pipeline_id -> 400 naming it, no UPDATE     200 stored     ok
  FAIL foreign default_assignee_id -> 400 naming it        200 stored     ok
  FAIL stage of another pipeline -> 400, no UPDATE         200 stored     ok
  ok   own pipeline/stage/user -> 200, UPDATE binds 7 values              ok
  ok   all null -> 200 with no ownership lookup                           ok
  2/5                                                                     5/5
```
Files: `routes/integrations.js` +14 / −0 (lines 6, 54–68).

**Test support (Parts 30–33).** `tests/helpers/load-route.js`: `TEST_APP_ROOT=<mirror> NODE_PATH=<app>/node_modules node --test <file>` runs any route test against a copy of the app — the "baseline first" runs above used a scratchpad mirror of the four pre-fix routes. Whole suite after Parts 30–33: **198 tests, 198 pass** (176 + 22 new). `db.js`, `server.js`, `public/*` unchanged. Still to do in Part 3: `notifySystem` placeholder mismatch (34) and the workspace-delete guard (35).

---

## Part 34 — System announcements silently reached nobody

**Bug.** `notifications.js` `notifySystem` built one value tuple per user with placeholders stepping by **six** (`$1,$2,…,$7,$8,…`) but bound only **four** values per user. With exactly one user the numbers line up; with two or more the INSERT references `$7` upward, Postgres rejects the statement, and the surrounding `catch` only logs to the console. `POST /api/notifications/announce` returned `{ success: true }` while no notification row was written.

**Fix.** Placeholders step by four to match the four bound values (`($1,$2,NULL,'system','system',$3,$4)`, `($5,$6,…,$7,$8)`, …). Nothing else changed.

**Verification — `tests/unit/notify-system.test.js`** (the real `notifications.js` bound to a fake pool that, like Postgres, rejects a statement whose highest `$n` exceeds the bound values; `console.error` captured):
```
BASELINE                                                                           LIVE
  FAIL notifySystem, 3 users -> one INSERT, placeholders = bound values,           ok   12 values, $12 max,
       one tuple per user, nothing swallowed          $18 referenced, error swallowed     3 tuples, no error
  ok   no users -> no INSERT                                                       ok
  ok   POST /announce as member -> 403, no query                                   ok
  FAIL POST /announce as owner -> 200 and a row per member  200 but INSERT failed  ok
  ok   missing title -> 400                                                        ok
  3/5                                                                              5/5
```
`tests/helpers/load-route.js` gained a `notifications` option so a route test can use the real module instead of the no-op stub. Files: `notifications.js` +6 / −2 (line 48).

---

## Part 35 — A workspace could never be deleted

**Bug.** `routes/workspace.js` `DELETE /` guards against deleting your last workspace by counting `user_workspaces` rows for `req.userId`. In this schema a person has one `users` row **per workspace** (`UNIQUE(workspace_id, email)`), so that count is always exactly one and the endpoint always answered `400 Cannot delete your only workspace` — even for an owner of several workspaces.

**Fix.** Count memberships by the person's identity: `SELECT COUNT(*) FROM user_workspaces uw JOIN users u ON u.id = uw.user_id WHERE u.email = (SELECT email FROM users WHERE id = $1)`. The transactional delete that follows is unchanged (every statement scoped to `req.workspaceId`).

**Verification — `tests/routes/workspace-delete.test.js`** (fixture: `owner@x` has user rows in workspaces 7 and 9; `solo@x` only in 11):
```
BASELINE                                                                 LIVE
  FAIL owner of two -> 200, every DELETE bound to [7], COMMIT   400        ok
  ok   owner of one -> 400, nothing deleted                                ok
  ok   member -> 403, no query                                             ok
  2/3                                                                      3/3
```
Files: `routes/workspace.js` +8 / −1 (lines 165–174).

Whole suite after Parts 34–35: **206 tests, 206 pass**. `db.js`, `server.js`, `public/*` unchanged. Not touched by decision: the password-reset token in the response (no SMTP yet). Next: Part 4 (new server coverage) and Part 5 (client pure-function coverage).

---

## Part 37 — New server coverage (test-consolidation Part 4 of 5)

**Scope.** Tests only. No application file changed in this part (`git status`: only `tests/` and `tests/README.md`). The goal was to put the untested, high-risk server paths under the same fake-pool / real-HTTP harness the rest of the suite uses, so a future regression in tenant isolation or the session gate fails a test instead of shipping.

**What was uncovered before this part.** The session gate itself (`middleware/auth.js`) was stubbed out by every route test and never exercised; the two endpoints that move a session between workspaces; member removal; plain contact CRUD and bulk delete; the field-definition factory behind four routers (16 endpoints); the public inbound-lead webhook; the chat and notification HTTP routes; the reorder helper; the admin login (previously only proven in scratchpad harnesses in Parts 1/3/4).

**New files (10, 53 tests):**

| File | Proves |
|---|---|
| `tests/unit/require-auth.test.js` | Real middleware: no session → 401 without touching the DB; a session whose user is not a member of its workspace → 401 **and** `session.destroy()`; a member gets `req.userId` from the session and `req.workspaceId` / `req.userRole` from the membership row (params `[userId, workspaceId]`); DB error → `next(err)`, nothing sent |
| `tests/routes/auth-workspace-switch.test.js` | `POST /select-workspace` and `/switch-workspace`: no session → 401 with no query; workspace with no `users` row for the caller's **email** → 403 and the session object unchanged (lookup is by the session user's email, never by anything in the body); own → session rebound to that workspace's user row and its role (owner in ws 7 becomes member in ws 9, no carry-over) |
| `tests/routes/workspace-members.test.js` | `DELETE /members/:id`: member → 403; self → 400; user id from another workspace → 404 with the lookup bound `[id, workspaceId]` and zero writes; own member → `UPDATE contacts SET assigned_to=NULL` and `DELETE FROM users` both bound `[id, 7]` inside BEGIN/COMMIT |
| `tests/routes/contacts-crud.test.js` | List joins carry `s.workspace_id = c.workspace_id` / `u.workspace_id = c.workspace_id`; foreign `stage_id` / `assigned_to` → 400 naming the field, no INSERT; duplicate email in any case → 409; own POST lower-cases the email and defaults the assignee to the caller; PUT / `PATCH /:id/stage` / `DELETE /:id` on a foreign contact → 404 with the scoped statement; bulk delete of `[10,11,12,13]` where only 10 and 12 are ours → `{deleted: 2}` via `id IN (...) AND workspace_id=$1`; empty / non-array → 400 with no query |
| `tests/routes/field-crud.test.js` | `createFieldRouter('deal_fields')`: list bound to the workspace; type outside the allow-list → 400; missing key → 400; `23505` → 400; valid → 201 with `position = MAX+1`; PUT / DELETE on another workspace's field → 404 (`AND workspace_id=$n` on the statement). Static check: the factory is called exactly four times, with the literal table names `custom_fields`, `deal_fields`, `object_fields`, `task_fields` (the name is interpolated into SQL, so it must never come from input) |
| `tests/routes/integrations-receive.test.js` | Public `POST /receive/:key`: unknown or inactive key → 404 with zero writes; neither name nor email after mapping → 422 with a `webhook_logs` error row; new lead → contact inserted in the **key's** workspace (never the payload's), email lower-cased, `data.budget` captured through the dot-path map into `custom_data`, assignee from the hook, deal in the hook's pipeline/stage, response `{success, contact_id, deal_id}`; existing email → scoped UPDATE `[..., 55, 7]` and no INSERT |
| `tests/routes/chat-http.test.js` | `GET /messages` bound `[workspaceId, before]`, returned oldest-first; `GET /unread` bound `[workspaceId, userId]`; non-string or blank content → 400 with no INSERT; valid → 201 `{id, created_at}`, stored trimmed as `[7, 42, 'hallo']` and the read cursor upserted; `PATCH /read` upserts on `(user_id, workspace_id)` |
| `tests/routes/notifications.test.js` | list / `:id/read` / `read-all` / `clear` / `preferences` are all bound to the caller's `user_id`; unread count computed; preferences must be an object |
| `tests/unit/reorder.test.js` | `reorderItems` writes positions 0..n-1 in the given order, every UPDATE carrying the caller's WHERE clause and params, inside BEGIN/COMMIT; a failure mid-way → ROLLBACK, no COMMIT, error rethrown |
| `tests/routes/admin-login.test.js` | Ports the Part 1/3/4 scratchpad harnesses into the suite: `{secret: [SECRET]}` → 401 (no string coercion); wrong / empty → 401 and no regeneration; correct → `session.regenerate()` runs **before** `isAdmin` is set, so state planted in the pre-login session is gone; `ADMIN_SECRET` unset → 503; invite endpoints → 401 without `isAdmin` and no query; logout destroys the session. No secret is printed anywhere; the test uses its own constant |

**Harness notes.** Two tests needed the existing session-aware pattern (a `withSession` middleware in front of the real router) instead of the `user` stub, because the code under test is the code that *sets* `req.session`. `require-auth` and `field-crud` load their module directly with `inject('db.js', …)` rather than through `loadRoute`, since neither is a route file. Three test-side mistakes were caught and fixed on the first run (`pool.find` returns the *first* matching query, so tests that issue several requests reset the log before the one they assert on; the receive route answers 200, not 201; the contacts INSERT binds `custom_data` at `$6` and `assigned_to` at `$7`). No route was changed to make a test pass.

**Result.** Suite before this part: 206 tests. After: **259 tests, 259 pass, 0 skipped** (`npm test`). `tests/README.md` §6 coverage table gained rows for the Part 2–3 tests (`task-projects-statuses`, `deals-objects`, `pipelines-stages`, `integrations-settings`, `notify-system`, `workspace-delete`) that were missing, plus the ten above.

Files: `tests/unit/require-auth.test.js` (new), `tests/unit/reorder.test.js` (new), `tests/routes/auth-workspace-switch.test.js` (new), `tests/routes/workspace-members.test.js` (new), `tests/routes/contacts-crud.test.js` (new), `tests/routes/field-crud.test.js` (new), `tests/routes/integrations-receive.test.js` (new), `tests/routes/chat-http.test.js` (new), `tests/routes/notifications.test.js` (new), `tests/routes/admin-login.test.js` (new), `tests/README.md` (+16 rows in §6). Next: Part 5 (client pure-function coverage).

---

## Part 38 — Client pure-function coverage (test-consolidation Part 5 of 5)

**Scope.** Tests only. No file under `public/`, `private/`, `routes/`, `utils/`, `middleware/` or the root changed (`git status`: only `tests/`, the two test docs and this log).

**Why.** Every browser test in the suite needed `jsdom`, which is deliberately not installed (zero-dependency rule). So all four `tests/client/*` files skipped and **no line of `public/js/` was executed by `npm test`**. Fifteen browser helpers are pure or read only file-scope state, and can run under `node:test` without a fake browser.

**Helper — `tests/helpers/client-fn.js` (new, zero deps).** `loadFns(file, [names], { state, extra })` reads the real browser file, finds `function NAME(` (asserting exactly one occurrence), slices to the matching brace, and evaluates all requested functions in **one** `new Function` body together with `let` declarations for the state they read (`fields`, `contactColumns`, `sortKey`, `sortDir`, `currentWorkspace`, `currentLang`). Those are file-scope `let`s in the browser, not `window` properties, so one shared script is the only way to reach them; `__set(name, value)` assigns them from the test. `sliceConst(file, NAME)` extracts a top-level `const NAME = {…}|[…];` (used for `STAT_CARD_DEFS`, `DEFAULT_STAT_ORDER`, `TRANSLATIONS`). Works with `TEST_APP_ROOT`, so a mirror run needs no extra harness. Renamed or removed function → "found 0 times", never a silent pass.

**New files (7, 38 tests incl. 2 todo):**

| File | Functions (source) | Proves |
|---|---|---|
| `tests/client/csv-import.test.js` | `detectDelimiter`, `parseCSV`, `toFieldKey`, `autoMapHeader` (`public/js/admin-import.js`) | tab wins only when it beats both others, `;` beats `,` only when strictly more, ties fall to `,`; the first non-blank line decides; quoted field with embedded delimiter and `""` escape; CRLF; blank lines dropped; trailing empty field kept; custom delimiter; slug rules (`Vor- und Nachname` → `vor_und_nachname`, `Straße` → `stra_e`); one English and one German alias per built-in column, whitespace collapsed; custom field by name or by key → `custom:<key>`; unknown → `skip` |
| `tests/client/core-helpers.test.js` | `buildPageNumbers`, `waLink`, `esc`, `fmtDate` (`public/js/core.js`) | ≤ 7 pages → all; `(1,10)`, `(3,10)`, `(5,10)`, `(8,10)`, `(10,10)` windows with the U+2026 gap; `waLink`: null / < 6 digits → `null`, digits-only URL, default `Hi {{name}}, ` encoded, workspace template with `{{company}}` via `__set`, string contact; `esc` escapes `& < > "` and **not** `'` (pinned), null → `''`; `fmtDate` falsy → `''`, `Mar 5, 2026` |
| `tests/client/contacts-helpers.test.js` | `effectiveContactColumns`, `getSortValue`, `sortContacts` (`public/js/contacts.js`) | no saved layout → 7 built-ins + custom fields with default visibility, labels through `t()`; saved layout sets order and visibility, drops unknown keys, appends new columns with defaults; no sort key → **same array reference**; case-insensitive text; input not mutated; `desc` flips; stage/assignee use joined names; `created_at` numeric; custom number field via `parseFloat` (`'9'` before `'12'`), custom date by time, missing value as `''` |
| `tests/client/analytics-helpers.test.js` | `fmt`, `fmtCurrency`, `buildStatOrder` (+ `STAT_CARD_DEFS`, `DEFAULT_STAT_ORDER`) (`public/js/analytics.js`) | `—` for null, rounding, `K`/`M` thresholds and decimals; default six cards; the two value cards dropped when `config.value_field` is null; saved order kept, unknown ids dropped, hidden flags; **pinned:** `['constructor']` is currently accepted because the lookup is a plain-object property read (`test.todo` to use `hasOwnProperty`) |
| `tests/client/tasks-helpers.test.js` | `buildSubtaskMap`, `fmtSize` (`public/js/tasks.js`) | children grouped under `parent_id` in list order, roots not keys, empty → `{}`; `0 B`, `1023 B`, `1.0 KB`, `1.5 KB`, `1.0 MB`, `5.5 MB` |
| `tests/client/i18n.test.js` | `TRANSLATIONS`, `t` (`public/js/core.js`), `public/index.html` | exactly `en` and `de`, every value a non-empty string; key parity in both directions; every `data-i18n` / `data-i18n-ph` key in the **whole** page (121 attributes) exists in both dictionaries (the earlier check in `ui-onboarding.test.js` only covered the Integrations section); `t()` falls back current → `en` → key, unknown language → `en` |
| `tests/client/field-key.test.js` | `generateFieldKey` (`private/admin.html` inline script), `toFieldKey` (`public/js/admin-import.js`), static scan of `settings.js` / `objects.js` | both agree on words, digits and whitespace; **pinned divergence:** the admin console deletes punctuation and the app replaces it (`Ust-ID` → `ustid` vs `ust_id`, `E-Mail` → `email` vs `e_mail`) with a `test.todo` to unify; the five inline slugifiers in the app (`settings.js` ×4, `objects.js` ×1) use exactly the `toFieldKey` rule, so the app side is self-consistent |

**Two facts pinned, not fixed** (both are behaviour, not security; left for a deliberate decision): the `generateFieldKey` / `toFieldKey` divergence, and the plain-object card lookup in `buildStatOrder`. Each has a `test.todo` naming the change.

**Verification — mirror with deliberate breakage** (`TEST_APP_ROOT=<scratchpad copy of public/ + private/>`; `parseCSV` quote handling removed, both `'…'` pushes removed from `buildPageNumbers`, `sortContacts` returns `cmp` regardless of `sortDir`, `de.nav_deals` deleted from `TRANSLATIONS`):
```
BASELINE (broken mirror)                                                        LIVE
  FAIL parseCSV: quoted fields keep the delimiter and unescape ""                 ok
  FAIL buildPageNumbers: windows … with a single-character ellipsis              ok
  FAIL sortContacts: text keys sort case-insensitively; … desc flips             ok
  FAIL i18n: key parity                                                          ok
  FAIL i18n: every data-i18n key in index.html exists in both dictionaries       ok
  FAIL t(): current language, then English, then the key   (de.nav_deals gone)   ok
  30/36                                                                          36/36
```
Every other test stayed green on the mirror, so the failures are specific to the mutated bodies.

**Result.** Suite before this part: 259 tests. After: **297 tests, 295 pass, 2 todo, 0 fail, 0 skipped** (`npm test`; the jsdom-gated and DB-gated files are unchanged). `npm run test:client` runs the seven new files without `jsdom`.

**Docs.** `tests/README.md` §2 (`client/` row), §6 (+7 rows), §8 (slicing gotcha). `tests/HOW_EACH_TEST_WORKS.md` new §D.4 for `client-fn.js`.

Files: `tests/helpers/client-fn.js` (new), `tests/client/csv-import.test.js`, `tests/client/core-helpers.test.js`, `tests/client/contacts-helpers.test.js`, `tests/client/analytics-helpers.test.js`, `tests/client/tasks-helpers.test.js`, `tests/client/i18n.test.js`, `tests/client/field-key.test.js` (all new), `tests/README.md`, `tests/HOW_EACH_TEST_WORKS.md`.

**Test-consolidation plan (Parts 1–5) complete.** Parts 36–38 in this log. Still open and not requested: password-reset token in the response (waits for SMTP), engine scope enforcement, delivery-row pruning.

---

## Part 39 — Import-CSV modal: "Import contacts" button clipped after ticking "Create deals during import"

**Symptom.** In Contacts → Import CSV, on the column-mapping step, ticking *Create deals during import* reveals the pipeline/stage controls and pushes the *Back* / *Import contacts* bar below the bottom edge of the dialog. There is no scrollbar, so the button cannot be reached.

**Cause.** `.modal` is `display:flex; flex-direction:column; max-height:min(88vh,860px); overflow:hidden` (`public/style.css:1180–1189`). Every other capped modal puts its content in `.modal-body` (`flex:1; min-height:0; overflow-y:auto`, `style.css:1203`) with the footer as a `flex-shrink:0` sibling (`style.css:1205–1210`). The import modal was the one exception: its three step `<div>`s were dropped straight into `.modal` with no scroll container, and each step's `.modal-actions` bar was **inside** the step. A flex item's `min-height` is `auto`, so `#import-step-map` could not shrink below its content; once `#import-deal-options` (~200 px) was shown the step exceeded the cap and `overflow:hidden` clipped its tail — the action bar.

**Fix (markup + one function, no CSS change).**
- `public/index.html` `#import-modal`: the three steps now sit inside one `<div class="modal-body">`; the two action bars were lifted out to be direct children of `.modal` as `#import-footer-map` (Back + `#import-run-btn`) and `#import-footer-done` (Done), both `hidden` by default. Button ids, labels and `onclick`s are unchanged.
- `public/js/admin-import.js` `showImportStep(step)`: besides toggling `import-step-<s>`, it now toggles `import-footer-<s>` when that element exists (the upload step has no footer). All four call sites (`openImportModal`, after `renderImportMapping`, `importBack`, end of `runImport`) go through this function, so nothing else changed.
Result: the body scrolls when the step is taller than the box, and the action bar stays pinned at the bottom like every other modal.

**Verification — `tests/client/import-modal-layout.test.js`** (static, no jsdom; the real `showImportStep` is run against a five-element fake `document`):
```
BASELINE (pre-fix mirror)                                                    LIVE
  FAIL exactly one .modal-body, all three steps inside it                     ok
  FAIL no action bar inside any step div                                      ok
  FAIL map/done footers are siblings of the body, hidden, with the buttons    ok
  FAIL showImportStep shows the step AND its footer, hides the others         ok
  0/4                                                                         4/4
```
Whole suite: **301 tests, 299 pass, 2 todo, 0 fail**. `node --check public/js/admin-import.js` clean.

Manual check for the developer (app not started here): Contacts → Import CSV → drop a CSV → tick *Create deals during import* → the mapping area scrolls and *Back* / *Import contacts* stay visible at the bottom; run the import → the *Done* bar replaces them; *Back* returns to the upload step, which has no bar.

Files: `public/index.html` (+13 / −7, lines 1677–1780 region), `public/js/admin-import.js` `showImportStep` (+5 / −1, lines 113–119), `tests/client/import-modal-layout.test.js` (new), `tests/README.md` (+1 row).

---

## Part 40 — Engine webhook: `column "events" does not exist` (stale `engine_webhook` table from an older branch)

**Symptom.** Integrations → Engine → *Send test event* (and any outgoing engine event) fails with PostgreSQL error 42703:
```
error: column "events" does not exist
    at emitEngineEvent (utils/engine-webhook.js:164)      hint: Perhaps you meant "engine_webhook.event"
```

**Root cause — not a code inconsistency, a stale table.** The current `db.js` (commit `d35a8f3`, Stage 1) defines `engine_webhook (id, workspace_id, url, secret, events JSONB, description, active, created_by, …)`, and every file and doc uses `events` (`utils/engine-webhook.js:167`, `routes/engine-settings.js:20,49,57`, `ONBOARDING_ENGINE.md:33,143`). The live database, however, was first started from the earlier `outgoingendpoints` / `apiEndpoints` branches, whose `db.js` created a **different** `engine_webhook`: one row per workspace with `event TEXT`, `target_url`, `api_key TEXT NOT NULL UNIQUE`, `stage_ids`, `payload_map`. `CREATE TABLE IF NOT EXISTS` sees a table of that name and does nothing, so the old shape survives every restart. Against it the subscriber lookup fails on `events`, and the settings `PUT` would fail too (`url`, `description`, `created_by` missing; `api_key NOT NULL` without a default). `main` and `dealcontacttasksync` never defined this table; the two old branches did (verified with `git show <branch>:db.js`). Neither old branch created anything that references `engine_webhook` (`engine_delivery_logs` and `documents` have no FK to it), so they are left alone.

**Fix — `db.js` lines 468–484, a guarded one-time fix-up in front of the Stage 1 `engine_webhook` CREATE.** It probes `information_schema.columns` for `engine_webhook.api_key` (only the old shape has it). If present: `CREATE TABLE IF NOT EXISTS engine_webhook_legacy AS SELECT * FROM engine_webhook` (plain copy, keeps every old row), `DROP TABLE IF EXISTS engine_webhook_deliveries` (created by the current file against the old table; it can hold no rows because every emit failed before its INSERT), `DROP TABLE engine_webhook` (no CASCADE: an unexpected dependent makes the start fail loudly rather than being dropped), then a console line. The unchanged Stage 1 block then creates `engine_webhook` and `engine_webhook_deliveries` in the current shape. On a database built by the current file the probe finds nothing and no statement runs. Decisions by the user: self-healing migration rather than manual SQL; old rows kept.

**Verification.**
- `tests/unit/db-migrations.test.js` (fake pool): the probe runs before the CREATE and, on a normal database, no `DROP TABLE` / `legacy` statement is issued (the existing "additive" guard stays green); when the fake pool answers the probe with a row, the statements are exactly `CREATE … engine_webhook_legacy AS SELECT` → `DROP TABLE IF EXISTS engine_webhook_deliveries` → `DROP TABLE engine_webhook` → `CREATE TABLE IF NOT EXISTS engine_webhook (` → `… engine_webhook_deliveries (`, in that order, and nothing else is dropped. `npm run test:baseline` (pre-Stage-1 fixture): the two new assertions fail there together with the other Stage 1 ones (13 failures instead of 11), as designed.
- `tests/db/onboarding-schema.test.js` (real PostgreSQL 16, local throwaway `crm_stage1`, then dropped): builds the pre-Stage-1 schema, creates the old-branch table **verbatim** with a row (`api_key 'old-key'`), then runs the current `initDb()`:
```
BASELINE (db.js without the fix-up, DB_FILE=<copy>)                            LIVE
  FAIL engine_webhook has the current shape, none of the old columns   'url'   ok
  FAIL the old rows are kept in engine_webhook_legacy       relation missing   ok
  ok   deliveries FK targets a table named engine_webhook (trivially, the old one)   ok  (the new one)
  FAIL the subscriber query from emitEngineEvent runs        42703 on "url"    ok
  FAIL second initDb() leaves legacy copy + new table alone  relation missing  ok
  Stage 1 describe: 6/6                                                        6/6
  7/11                                                                         11/11
```
- Whole suite: **303 tests, 301 pass, 2 todo, 0 fail**. `node --check db.js` clean.

**What the developer will see.** On the next start against the affected database the log prints `engine_webhook: old-branch table replaced; its rows are kept in engine_webhook_legacy`, once. Afterwards `Send test event`, `PUT /api/engine-settings/webhook` and the outgoing `vertrag.unterschrieben` event work. To inspect or discard the copy later (Supabase SQL editor):
```sql
SELECT * FROM engine_webhook_legacy;        -- the old per-workspace rows (api_key, target_url, …)
DROP TABLE engine_webhook_legacy;           -- when no longer needed; nothing in the code reads it
```

Files: `db.js` (+17, lines 468–484), `tests/unit/db-migrations.test.js` (+37), `tests/db/onboarding-schema.test.js` (+64, plus `DB_FILE` support for baseline runs), `ONBOARDING_ENGINE_TESTING.md` (troubleshooting section appended), `tests/README.md` (§6 two rows).

---

## Part 41 — Onboarding from the deal editor + an "Onboarding" sidebar page

**Request.** A button in the deal edit view to start onboarding for the deal's contact, and a new left-sidebar page that lists onboarded contacts and shows where each one is in the process.

**No server or schema change.** `GET /api/contacts` already returns `onboarding_status`, `updated_at`, `drive_ordner_id` and the assignee name; the trigger `POST /api/contacts/:id/onboarding/start` already exists. Everything below is browser code plus i18n.

**A. Deal editor — "Start Onboarding" button.**
- `public/index.html` deal modal header: `#deal-onboarding-btn` next to the "＋ Task" button, hidden for a new deal exactly like that button (`openDealModal` toggles it with `id ? '' : 'none'`, `public/js/modals.js`).
- `startOnboardingFromDeal()` (`modals.js`, new): reads the **live** contact selection from `#df-contact` (so it works for a contact chosen but not yet saved); no contact → alert "Link a contact to this deal first"; fetches the contact's current status, confirms, posts, then re-renders only the deal's contact panel — the deal modal stays open.
- The deal's contact panel (`renderContactPanelReadOnly`) now shows an "Onboarding" row with the stage badge at the top.
- `public/js/contacts.js`: the confirm → POST → `invalidate()` part of `startOnboarding` moved into a shared `requestOnboardingStart(id, currentStatus)` (returns true when the status changed). `startOnboarding` keeps its declaration and the contact-detail button is unchanged; after a start it reloads whichever page is active (Onboarding page or contacts table) and opens the detail.

**B. "Onboarding" page.**
- Sidebar: new *Workspace* item after Contacts (`data-page="onboarding"`, label `nav_onboarding`); `switchPage` (`public/js/auth.js`) calls `loadOnboarding()`; `setLanguage` (`public/js/core.js`) re-renders it.
- `public/index.html` `#page-onboarding`: header with count, search box, one pill per active step with counts (`.stage-pills`, existing style) plus "All", table (Contact, Company, Status, Progress, Assignee, Last update), and an empty state.
- `public/js/onboarding.js` (new, loaded after `contacts.js`): four **pure** helpers — `onboardingSteps()` (the six active steps in `ONBOARDING_STATUS_META` order), `onboardingProgress(status)` → `{step, total: 6, pct}`, `filterOnboardingRows(rows, {status, q})` (drops `kein_onboarding` and unknown statuses, pill filter, case-insensitive name/company/email search, newest change first, no mutation), `onboardingCounts(rows)` — plus the render code. Progress is a six-segment bar coloured with the step's colour and an `n/6` label; the contact name opens the existing detail modal (`openDetail` falls back to `#detail-modal` off the contacts page), whose footer has the Start-Onboarding button.
- `public/style.css`: `.onb-*` rules only (count, hint, sub-line, pill count, progress bar). German labels stay German in both languages as before; 14 new i18n keys in both dictionaries (`nav_onboarding`, `page_onboarding`, `onb_page_hint`, `onb_filter_all`, `onb_col_*` ×6, `onb_empty_title`, `onb_empty_hint`, `onb_link_contact_first`, `onb_search_ph`).
- `public/js/guide.js`: the sidebar step's prose now mentions Onboarding; no new step.

**Verification.**
- `tests/client/onboarding-page.test.js`: the four pure helpers (order, 0/6 – 6/6, filtering, search over null fields, sorting, counts, no mutation) and the wiring (nav item, section ids, script order, `switchPage` and `setLanguage` branches).
- `tests/client/deal-onboarding.test.js`: header button attributes, visibility toggle in `openDealModal`, `startOnboardingFromDeal` reads `#df-contact` / refuses without a contact / delegates / never closes the modal, badge in the contact panel, `startOnboarding` delegates and the POST literal exists exactly once in `contacts.js`.
- Existing guards untouched and green: `ui-onboarding` (declaration and POST literal pinned), `i18n` (all new `data-i18n` keys in both dictionaries, parity), `contacts-helpers` (no new built-in column), `contacts-onboarding` (route untouched).
```
BASELINE (pre-change mirror of public/)          LIVE
  deal-onboarding: 0/6                            6/6
  onboarding-page: file fails (no onboarding.js)  8/8
```
Whole suite: **317 tests, 315 pass, 2 todo, 0 fail**. `node --check` clean on the six edited/new scripts.
- Test helper fix found on the way: `tests/helpers/client-fn.js` `sliceFn` took the first `{` after the function name, which broke on a destructured parameter (`function f(rows, { status } = {})`); it now skips the parameter list first.

**Manual check for the developer.** Open a deal that has a contact → header shows *Start Onboarding* and the contact panel shows the stage badge → click, confirm → badge reads "Formular versendet", modal stays open. Sidebar → *Onboarding* lists that contact with 1/6; pills and search filter; clicking the name opens the detail modal. Switch to German: labels translate, status names stay German.

Files: `public/index.html` (nav item, `#page-onboarding`, deal header button, script tag), `public/js/onboarding.js` (new), `public/js/contacts.js` (`startOnboarding` / `requestOnboardingStart`), `public/js/modals.js` (`openDealModal`, `renderContactPanelReadOnly`, `startOnboardingFromDeal`), `public/js/auth.js` (`switchPage`), `public/js/core.js` (14 keys ×2, `setLanguage`), `public/js/guide.js` (one word), `public/style.css` (`.onb-*`), `tests/client/onboarding-page.test.js` (new), `tests/client/deal-onboarding.test.js` (new), `tests/helpers/client-fn.js` (slicer fix), `ONBOARDING_ENGINE.md` (UI section appended), `tests/README.md` (§6 two rows).

---

## Part 42 — Manual onboarding status change + stage-triggered onboarding prompt

**Request.** (1) Let a CRM user change a contact's onboarding status by hand, on the deal and on the contact. (2) In Settings, let the owner pick pipeline stages; when a deal reaches one of them the CRM asks whether to onboard the deal's contact. Decision by the user: a manual change is pushed to the engine as a new event `onboarding.status_geaendert`.

**Server.**
- `utils/onboarding-statuses.js` (new): the seven statuses, one list. `routes/engine-api.js` takes it from there (still re-exports it); `routes/contacts.js` uses it without loading the engine router.
- `routes/contacts.js` **`PATCH /:id/onboarding-status`** `{ onboarding_status }`: digits-only id (400), value must be one of the seven (400 naming them), contact must be in the caller's workspace (404), scoped UPDATE bumping `updated_at`. When the value actually changes: `emitEngineEvent('onboarding.status_geaendert', { kundeId, daten: { onboarding_status, vorher, quelle: 'manuell', ausgeloest_von, kunde } })` (a webhook-table failure is logged and reported as `deliveries: 0`, never a 500) and an in-app notification. Same value again: 200, no event. Response `{ success, onboarding_status, vorher, event_id, deliveries }`. Changes made **by** the engine (`routes/engine-api.js`) are still never echoed back, so no loop.
- `routes/engine-settings.js`: `AVAILABLE_EVENTS` now `vertrag.unterschrieben`, `onboarding.status_geaendert`, `test.ereignis` (webhook `events` validation and the list returned by `GET /webhook`).
- `db.js`: `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_trigger_stage_ids JSONB NOT NULL DEFAULT '[]'` (additive, next to `analytics_config`). `routes/auth.js`: the six workspace SELECTs list the column so `currentWorkspace` carries it.
- `routes/workspace.js` **`PATCH /onboarding-trigger`** `{ stage_ids }`: owner-only (403); array of positive integers (400); every id must be a `pipeline_stages` row of this workspace (`… WHERE workspace_id=$1 AND id = ANY($2::int[])`, mismatch → 400, no UPDATE); stored deduplicated and sorted; response `{ success, stage_ids }`.

**Client.**
- `public/js/contacts.js`: `onboardingStatusSelect(contactId, status, ctx)` (seven options in process order, current selected) and `changeOnboardingStatus(id, status, ctx)` (PATCH, then re-render the calling context: deal contact panel / Onboarding page / contact detail; the contacts table is refreshed when visible). `requestOnboardingStart(id, status, { confirmed })` can skip its own confirm when the caller already asked.
- Shown next to the badge in the contact detail (`buildDetailHTML`), the deal editor's contact panel (`renderContactPanelReadOnly`) and the Onboarding page rows.
- Settings → Deals → **Onboarding trigger** card (owner-only): one checkbox per pipeline stage, grouped by pipeline, saved with `PATCH /api/workspace/onboarding-trigger`; rendered together with the pipelines list so stage edits show immediately.
- `public/js/onboarding.js`: `shouldPromptOnboarding(prev, next, triggerIds)` — true only when a deal **enters** the trigger set (not when moving between two trigger stages, re-saving the same stage, or clearing the stage); `maybePromptOnboarding(deal, prev, next)` — fetches the contact, never asks for a contact already in onboarding, `confirm`s, then starts without a second confirm and refreshes the Onboarding page if open.
- Hooked into both stage-change paths: kanban drop (`public/js/deals.js` `dealDrop`, previous stage captured before the optimistic update, prompt only after the server accepted the move) and the deal form (`public/js/modals.js` `saveDeal`, pre-edit stage from the loaded deal; a new deal created directly in a trigger stage also asks).
- i18n (both dictionaries): `onb_status_select_title`, `set_onboarding_trigger`, `hint_onboarding_trigger`, `onb_trigger_none`, `onb_stage_prompt`. CSS: `.onb-status-select`, `.onb-trigger-stage`.

**Verification.**
- `tests/routes/contacts-onboarding-status.test.js` (7): 400 on bad id / unknown status with no query; foreign → 404 no UPDATE; own → 200 body, UPDATE bound `[status, 60, 7]`, one event with `vorher` / `quelle: 'manuell'` / `kunde`, notification; emit failure → 200 with `deliveries: 0`; unchanged → no event, no notification; back to `kein_onboarding` allowed.
- `tests/routes/workspace-onboarding-trigger.test.js` (5): member → 403; non-array / non-integer / ≤ 0 → 400 with no query; foreign stage → 400 and no UPDATE, lookup bound `[7, ids]`; own → deduplicated, sorted, `['[30,32]', 7]`; empty list → no lookup.
- `tests/unit/onboarding-statuses.test.js` (3): shared list equals the schema constant; both routes require it, engine-api re-exports, contacts.js does not load the engine router; all **six** workspace SELECTs in `routes/auth.js` carry the column (caught that four of them spell `WHERE id=$1` without spaces and were missed by the first replace).
- `tests/unit/db-migrations.test.js`: the new column statement. `tests/routes/engine-settings.test.js`: `available_events` expectation updated to the three events (deliberate).
- `tests/client/onboarding-trigger.test.js` (7): the pure decision table (enter → ask; between trigger stages / same stage / leaving / cleared → no; string ids; no config → never) and the wiring (card, save, `dealDrop` order, `saveDeal`, no re-ask, confirmed start).
- `tests/client/onboarding-status-select.test.js` (4): seven options in order with one selected and the handler; unknown status selects nothing; used in the three places; `changeOnboardingStatus` endpoint and per-context refresh.
```
BASELINE (pre-change mirror of routes/ utils/ public/)   LIVE
  1 / 17 (the foreign-404 passes trivially: route absent)  26 / 26
```
Whole suite: **344 tests, 342 pass, 2 todo, 0 fail**. `npm run test:baseline` (pre-Stage-1 fixture): 14 expected failures (13 + the new column). `node --check` clean on all thirteen edited/new scripts. Existing pins untouched and green (`ui-onboarding`, `deal-onboarding`, `contacts-onboarding`, `deals`, `i18n`, `field-key`).

**Manual check for the developer.** Contact detail → pick a status in the dropdown → badge updates, the receiver gets `onboarding.status_geaendert` with `vorher`. Same from a deal's contact panel and from the Onboarding page. Settings → Deals → Onboarding trigger → tick a stage → Save. Drag a deal whose contact is not onboarded into that stage → prompt → OK → contact shows on the Onboarding page at 1/6. Drag it to another ticked stage: no prompt. A deal whose contact is already in onboarding: no prompt.

Files: `utils/onboarding-statuses.js` (new), `routes/contacts.js`, `routes/workspace.js`, `routes/auth.js` (6 SELECTs), `routes/engine-api.js`, `routes/engine-settings.js`, `db.js` (+2), `public/index.html` (settings card), `public/style.css`, `public/js/{contacts,modals,deals,settings,onboarding,core}.js`, five new test files, `tests/unit/db-migrations.test.js`, `tests/routes/engine-settings.test.js`, `ONBOARDING_ENGINE.md`, `ONBOARDING_ENGINE_TESTING.md`, `tests/README.md`.

---

## Part 43 — The two `test.todo` entries from Part 38 resolved

**1. Stat-card lookup accepted inherited property names.** `public/js/analytics.js` read `STAT_CARD_DEFS[id]` on a plain object in `buildStatOrder` (line 56) and in the card renderer (line 102), so a saved layout id such as `"constructor"` resolved to `Object.prototype.constructor` and survived as a "card". Both lookups now use `Object.hasOwn(STAT_CARD_DEFS, id)`; anything that is not an own key is dropped. `tests/client/analytics-helpers.test.js`: the "currently accepted" pin and the todo are replaced by one test — `['constructor', 'deals']` → only `deals`; `['__proto__', 'toString', 'hasOwnProperty']` → `[]`.

**2. Admin-console field-key slug differed from the app.** `private/admin.html` `generateFieldKey` deleted punctuation (`Ust-ID` → `ustid`) while the app's `toFieldKey` (`public/js/admin-import.js`) and the five inline copies in `settings.js` / `objects.js` replace runs of non-alphanumerics with one underscore (`ust_id`). The admin console now uses the app rule (six call sites vs one; keys already stored are untouched — only newly generated keys change). `tests/client/field-key.test.js`: the "pinned divergence" test and the todo are replaced by "agree on punctuation too" (`Ust-ID`, `E-Mail`, `Straße`, `a--b__c`, `(Preis)` identical in both), and the rule-count test now covers all seven copies including `admin.html` and asserts the old delete-punctuation regex is gone.

```
BASELINE (pre-change copies of analytics.js + admin.html)      LIVE
  FAIL inherited property names are not card ids                ok
  FAIL agree on punctuation too                                  ok
  FAIL every slugifier uses the same rule (admin.html count 0)   ok
  6/9                                                            9/9
```
Whole suite: **342 tests, 342 pass, 0 todo, 0 fail** (two fewer than Part 42: each todo and its "pinned" companion became one real test). `node --check public/js/analytics.js` clean.

Files: `public/js/analytics.js` (2 lines), `private/admin.html` (`generateFieldKey`), `tests/client/analytics-helpers.test.js`, `tests/client/field-key.test.js`, `tests/README.md` (two rows).

---

## Part 44 — Google Drive folder on contact and deal (embedded folder view + popup)

**Request.** Show the contact's Google Drive folder (`contacts.drive_ordner_id`, set by the engine or entered by hand) on the contact and on the deal, list the folder's files, and offer a preview in a popup for pictures, PDFs and Word files.

**Decisions by the user.** Folders are shared **"Anyone with the link"**; the value may be a full Drive link or a bare id; previews use **Google's own viewer**; and — after the question "why do we need googleapi, since the googledrive link is public" — **no API key**: the CRM embeds Google's folder widget (`https://drive.google.com/embeddedfolderview?id=<id>#list`) instead of listing files itself. A first cut with a server-side listing (API-key client, `GET /:id/drive-files`, a rate limiter, `GOOGLE_API_KEY` in `.env.example`) was written and then removed before anything ran; nothing of it remains (asserted by `tests/client/drive-ui.test.js`).

**What it means in practice.** Google's widget renders the file list with Google's icons; clicking a file opens Google's preview (images, PDF, Office documents, Google Docs). A *Popup* button opens the same widget in its own window. The trade-off versus an API key: no per-file rows or buttons of our own, and the widget needs `drive.google.com` in the production CSP `frameSrc`.

**Server.**
- `utils/google-drive.js` (new): `parseDriveFolderId` (bare id or any Drive folder link shape — `/drive/folders/<id>`, `/drive/u/0/folders/<id>`, `/open?id=`, `/folderview?id=` — `https` and `drive|docs.google.com` only, else `null`), `folderUrl`, `embedUrl`.
- `routes/contacts.js` **`PATCH /:id/drive-folder`** `{ drive_ordner_id }`: digits-only id (400); `null`/`''` clears; otherwise parsed → invalid → 400 `Not a Google Drive folder link or ID`; scoped `UPDATE contacts SET drive_ordner_id=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3` (404 when missing); response `{ success, drive_ordner_id: <bare id|null>, folder_url }`. No engine event (the engine owns this field; a manual entry is a correction). `PUT /:id` untouched. The engine's `PATCH /api/kunden/:id/status` still stores whatever it sends (≤ 255 chars); the UI parses a full link at read time, so both shapes display.
- `server.js`: production CSP `frameSrc` gains `https://drive.google.com`. Nothing else.

**Client.**
- `public/js/drive.js` (new, loaded after `contacts.js`): `parseDriveFolderId` (mirror of the server rule), `driveFolderUrl`, `driveEmbedUrl`, `driveSectionHtml(contactId, folderId, ctx)` — an input prefilled with the folder link, *Save*, *Open folder ↗*, *Popup*, then the embedded folder view in an `<iframe class="drive-embed">`; without a folder only a hint. **Every `src`/`href` is built from the validated id**, never from the stored or typed text; a stored value that is not a folder id is treated as none. `openDriveFolderPopup(btn)` opens the embed URL from a data attribute (validated again by regex) with `window.open(…, 'popup=yes,…')`, falling back to a new tab when popups are blocked. `saveDriveFolder(contactId, ctx)` validates client-side, PATCHes, `invalidate()`s and re-renders the calling context (contact detail → `openDetail`; deal → `renderContactPanelReadOnly({ id })`).
- `public/js/modals.js`: a "Google Drive" `detail-section` between Deals and Activities in the contact detail; a "Google Drive" block under the rows of the deal editor's contact panel (existing pinned literals untouched).
- `public/js/onboarding.js` + `index.html`: a *Drive* column on the Onboarding page with a folder link when set.
- i18n (both dictionaries): `onb_col_drive`, `drive_section`, `drive_folder_ph`, `drive_open_folder`, `drive_popup`, `drive_no_folder`, `drive_invalid`, `drive_embed_hint` (tells the user the folder must be shared "Anyone with the link" when the widget shows nothing). CSS: `.drive-section`, `.drive-folder-row`, `.drive-embed`, `.drive-hint`.

**Verification.**
- `tests/unit/google-drive.test.js` (3): seven accepted link/id shapes; eleven rejected inputs (`http:`, foreign host, file link, `javascript:`, spaces…); the two URLs; the module exports no listing client.
- `tests/routes/contacts-drive.test.js` (4): junk / `javascript:` / bad id → 400 with no query; foreign contact → 404 with the scoped UPDATE bound `[id, 61, 7]` and the row unchanged; a full link stored as the bare id `[ID, 62, 7]`; bare id accepted; `''` and `null` clear.
- `tests/client/drive-ui.test.js` (9): parser mirror; section with folder (prefilled link, Save, Open, Popup data attribute, iframe src, hint) / without (hint only, no iframe, no links) / with an untrusted stored value (nothing reaches src/href); script order; both views call `driveSectionHtml` and nothing references a server listing; popup reads only `dataset.embed` and matches the embed URL shape; save PATCHes the scoped endpoint and re-renders per context; `server.js` frames `drive.google.com` and has no limiter, `routes/contacts.js` has no `drive-files` route and no `GOOGLE_API_KEY`.
```
BASELINE (pre-change mirror)                       LIVE
  0 / 16 (two files fail to load, four route red)  16 / 16
```
Whole suite: **358 tests, 358 pass, 0 todo, 0 fail**. `node --check` clean on the seven edited/new scripts. Existing pins untouched and green (`contacts-crud` PUT, `onboarding-status-select`, `deal-onboarding`, `ui-onboarding`, `i18n`, `engine-api`).

**Manual check for the developer.** Share a Drive folder as "Anyone with the link" → open a contact → paste the link into the Google Drive section → Save → the folder's files appear in the embedded view; click a picture, a PDF and a .docx → Google previews each; *Popup* opens the same view in a window; the deal editor's contact panel shows the same section; the Onboarding page shows a folder link. In production (`NODE_ENV=production`) the iframe is allowed by the updated CSP.

Files: `utils/google-drive.js` (new), `routes/contacts.js` (`PATCH /:id/drive-folder`), `server.js` (CSP `frameSrc`), `public/js/drive.js` (new), `public/js/modals.js`, `public/js/onboarding.js`, `public/js/core.js` (8 keys ×2), `public/index.html` (script tag, Onboarding column), `public/style.css`, three new test files, `ONBOARDING_ENGINE.md`, `ONBOARDING_ENGINE_TESTING.md`, `tests/README.md`.

---

## Part 45 — Drive file sync: the contact's public folder is read with the Drive API and its files stored on the contact

**Request.** "When there is a folder link, navigate that link to get every file in there and automatically add it to our contact columns." Decisions by the user after discussion: folders stay public "Anyone with the link"; the CRM reads them with **one server-side Google API key** (`GOOGLE_API_KEY`, configured once by the developer — it identifies the app to Google, grants no access of its own, is never sent to the browser, and works for folders owned by any Google account); previews stay in Google's viewer (popup). Multi-tenant is unchanged: file rows carry `workspace_id` + `contact_id` and every route is workspace-scoped, so one key serves all workspaces and rows never cross one.

**Data (`db.js`, additive, after the Stage 1 block).** Table `contact_drive_files (id, workspace_id → workspaces CASCADE, contact_id → contacts CASCADE, file_id, name, mime_type, size BIGINT, modified_at, synced_at, UNIQUE (contact_id, file_id))` + index `(workspace_id, contact_id)`; contacts gain `drive_synced_at`, `drive_sync_error`, `drive_file_count INTEGER NOT NULL DEFAULT 0`. Only raw facts are stored; kind / preview URL / open URL are derived at read time. Top level of the folder only; sub-folders are rows of kind `folder` that open in Drive.

**Server.**
- `utils/google-drive.js`: `parseDriveFolderId`, `folderUrl`, `embedUrl` (unchanged); `fileKind(mime)`; `describeFile(row|googleFile)` → `{ id, name, mime_type, size, modified_at, kind, is_folder, previewable, preview_url, open_url }` with URLs built only from an id matching `^[A-Za-z0-9_-]+$` (images/PDF/Office → `drive.google.com/file/d/<id>/preview`, Google Docs types → `docs.google.com/<app>/d/<id>/preview`, folders → no preview); `createDriveClient({ apiKey, fetch, now, ttlMs, timeoutMs, maxPages })` → `listFolder(folderId)`: `files.list` with `q='<id>' in parents and trashed=false`, `fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)`, `pageSize=200`, follows `nextPageToken` up to 10 pages, 60 s cache, `AbortSignal.timeout(10 s)`; `DriveError` codes `not_configured`, `invalid_folder`, `not_public` (Google 404), `upstream`, `timeout`. The key is never logged.
- `utils/drive-sync.js` (new): `createDriveSync({ pool, drive, now, log })` → `syncContact(ws, id)` (contact lookup scoped → no/invalid folder: delete rows + count 0 → `listFolder` → on `DriveError` keep the rows and store the code in `drive_sync_error` → else one transaction: `DELETE … WHERE NOT (file_id = ANY($3::text[]))`, one multi-row `INSERT … ON CONFLICT (contact_id, file_id) DO UPDATE`, `UPDATE contacts SET drive_file_count, drive_synced_at, drive_sync_error=NULL`; files with an unexpected id or an empty name are skipped), `listFiles(ws, id)`, `syncDue({ olderThanMs, limit })` (never-synced first, sequential), `startWorker({ intervalMs, olderThanMs })` (`unref`, overlap guard, idle without a key). `getDriveSync()` singleton re-reads the key per call; `startDriveSyncWorker()` reads `DRIVE_SYNC_INTERVAL_MIN` (15) / `DRIVE_SYNC_MAX_AGE_MIN` (60).
- `routes/contacts.js`: `GET /:id/drive-files` (stored list only — never calls Google; `{ folder_id, folder_url, embed_url, synced_at, sync_error, configured, files }`), `POST /:id/drive-sync` (503 without a key; a Drive failure is 200 with `sync_error` and the cached rows), `PATCH /:id/drive-folder` now syncs right after saving (clearing always — it only deletes rows; reading needs the key) and returns `sync: { synced_at, sync_error, count }`.
- `routes/engine-api.js` `PATCH /api/kunden/:id/status`: when `drive_ordner_id` was sent, a background `syncContact` is kicked **without awaiting** — the engine's response is unchanged.
- `server.js`: `driveSyncLimiter` 20/min per IP on `POST /api/contacts/:id/drive-sync`; `startDriveSyncWorker()` after the webhook worker in the `initDb().then` chain. `.env.example`: `GOOGLE_API_KEY` with the one-time setup steps and the two optional intervals.

**Client.**
- `public/js/drive.js`: the section now has the folder row (input, Save, Open folder ↗, Popup = Google's embedded view in a window), a status line (last sync / error / "key missing") with a **Sync** button, and our own file list: icon by kind, escaped name, size, date, **Preview** (Google's viewer in a popup, URL only from a data attribute) and **Open ↗**. The inline iframe is gone (reachable via Popup). `loadDriveFiles` GETs the stored list; `syncDriveFiles` POSTs a re-sync.
- `public/js/modals.js`: contact detail and deal contact panel call `loadDriveFiles` after rendering; the deal panel's column rows skip the new count column (the block covers it).
- `public/js/contacts.js`: new optional built-in column **Drive files** (`drive_file_count`, hidden by default, enable in Settings → Contact Columns) showing `📁 n` linking to the folder; numeric sort. `public/js/onboarding.js`: the Drive cell shows the count.
- i18n (both dictionaries): `col_drive_files`, `drive_sync`, `drive_synced_at`, `drive_never_synced`, `drive_preview`, `drive_open`, `drive_empty`, `drive_not_public`, `drive_timeout`, `drive_upstream`, `drive_not_configured` (the `drive_embed_hint` key was dropped). CSS: `.drive-status(-row)`, `.drive-file*`.

**Verification.**
- `tests/unit/google-drive.test.js` (14): parser; `describeFile` for Google's shape and our row shape, Google Docs, folders, unknown types, bad ids; client request params and signal, pagination joined with the token only on the second request, `maxPages`, cache TTL, 404/403/timeout/network mapping, no network for a bad id, not configured.
- `tests/unit/drive-sync.test.js` (8): unknown contact; no/unparsable folder → DELETE + count 0 with no Google call; success → DELETE-not-in-list `[60, 7, ['a1','b2']]`, one upsert whose placeholder count equals its 14 bound values (bad id and empty name skipped, name trimmed), `[2, 60, 7]`, BEGIN→…→COMMIT in order, no ROLLBACK; Google failure → rows kept, code stored, rows returned; unexpected error → `upstream`; empty folder; `syncDue` query and sequential syncs; unconfigured → idle; worker tick / overlap / stop.
- `tests/routes/contacts-drive.test.js` (9): PATCH validation with no sync, foreign 404, link → bare id + immediate sync summary, Drive failure still 200, clearing syncs without a key while setting without a key does not; GET foreign 404, empty shape, stored list without Google, stored full link normalised, stored error reported, `configured:false` without a key; POST 503/404/400, sync now in the GET shape, failure → 200 with `sync_error` and cached rows.
- `tests/routes/engine-api-drive-sync.test.js` (2): status without a folder → no sync; with a folder → 200 before the sync resolves, exactly one `syncContact(7, 60)`, response unchanged. `tests/routes/engine-api.test.js` injects a no-op sync.
- `tests/unit/db-migrations.test.js` (+2), `tests/unit/server-wiring.test.js` (+2), `tests/client/drive-ui.test.js` (11, rewritten), `tests/client/contacts-helpers.test.js` (eighth built-in column — deliberate).
```
BASELINE (pre-change mirror)                                  LIVE
  4 / 20 (three files fail to load; describeFile/client red)  20 / 20 (+ the touched files)
```
Whole suite: **393 tests, 393 pass, 0 todo, 0 fail**. Real PostgreSQL 16 (throwaway `crm_stage1`, dropped again): 12/12 — the table exists after migrating the pre-Stage-1 schema, `UNIQUE (contact_id, file_id)` rejects a duplicate (23505), rows vanish with their contact (CASCADE), the three contact columns exist. `node --check` clean on the eleven edited/new scripts.

**Manual check for the developer** (`GOOGLE_API_KEY` in `.env`, a folder shared "Anyone with the link"): paste the link on a contact → Save → the files appear at once with Preview / Open; Preview opens Google's viewer in a popup for a picture, a PDF and a .docx; Settings → Contact Columns → enable *Drive files* → the table shows `📁 n`; the deal editor shows the same list; the engine's `PATCH /api/kunden/:id/status` with a folder fills the list without anyone clicking; a private folder shows "not shared as Anyone with the link" and keeps the old rows; without the key the folder link still works and the status line says the key is missing.

Files: `db.js` (+22), `server.js` (limiter, mount, worker), `.env.example`, `routes/contacts.js`, `routes/engine-api.js`, `utils/google-drive.js`, `utils/drive-sync.js` (new), `public/js/drive.js`, `public/js/modals.js`, `public/js/contacts.js`, `public/js/onboarding.js`, `public/js/core.js`, `public/style.css`, tests as listed, `ONBOARDING_ENGINE.md`, `ONBOARDING_ENGINE_TESTING.md`, `tests/README.md`.

---

## Part 46 — Drive files window: a desktop-style file browser with the preview inside

**Request.** "Make the whole files be like a desktop in the new window where the user can find the list of files and preview them there like an icon."

**What was built.** A standalone page `public/drive.html` (served by the existing `express.static`, no server change, no schema change), opened by the CRM with `window.open('/drive.html?contact=<id>[&file=<fileId>]')`. It runs on the same origin, so the session cookie, the theme (`localStorage.theme`) and the language (`localStorage.lang`) carry over.
- **Desktop:** the contact's stored files as icon tiles (icon by kind, name, size), with a search box, an Icons/List toggle, a Sync button, "Open folder ↗", and a status line (last sync / error / key missing / item count). Click selects, double-click or Enter previews, arrow keys move the selection, Escape closes the preview.
- **Preview pane** (right side; stacked below on narrow windows): file name, kind, size, date, "Open in Drive ↗", Close, and an `<iframe>` of the file's `preview_url` — Google's own viewer page, which is built to be framed. The production CSP already allows `drive.google.com` and `docs.google.com` in `frameSrc` (Part 44). Folders and non-previewable types show a hint with the Open link instead.
- **Deep link:** the row *Preview* buttons in the contact detail / deal panel open the window with `&file=<id>` so that file is selected and previewed at once; the folder row's *Files window* button opens it plain. The bare Google popup and the embedded-view popup are gone (`openDriveFolderPopup` removed; `driveEmbedUrl` stays for the API's `embed_url`).
- **States:** not signed in → "Please log in to the CRM first" with a link to `/`; contact not in the workspace → "Not found"; no folder / empty / not synced / key missing / not public / timeout / upstream — all worded in the window's own small en/de dictionary.

**Safety.** `?contact` must be a positive integer and `?file` a Drive id; anything else is ignored. Tiles carry only the validated file id as a data attribute; names are escaped text; there is no inline JavaScript with file data and no inline `<script>` on the page. The iframe `src` is set only when the URL matches `^https://(drive|docs)\.google\.com/`; the Open links likewise. The window calls the same workspace-scoped endpoints as the CRM (`GET …/drive-files`, `POST …/drive-sync`, `GET /api/contacts/:id` for the title).

**Files.** `public/drive.html` (new), `public/js/drive-window.js` (new: dictionary, `dwParams`, `dwFilterSort`, `dwTile`, `dwStatusText`, `dwPreviewSrc`, then the DOM code), `public/js/drive.js` (`openDriveWindow`, row Preview → window, *Files window* button, `driveFileRow(f, contactId)`), `public/js/core.js` (`drive_files_window` replaces `drive_popup`), `public/style.css` (`.dw-*`).

**Verification.** `tests/client/drive-window.test.js` (9): dictionary parity and non-empty values; `dwParams` accept/reject; `dwFilterSort` folders first, name/date order, search, no mutation; tile escaping + validated id only + no inline JS; status precedence; iframe source Google-only; `drive.html` links the stylesheet and the script, has all 18 ids, no inline script, frame hidden by default; `openDriveWindow` validates both ids and opens `/drive.html?contact=…`; row Preview delegates; old popups gone; CSP unchanged. `tests/client/drive-ui.test.js` updated to the new buttons.
```
BASELINE (pre-change mirror)                          LIVE
  9 / 13 in drive-ui (row/section/wiring red), the    21 / 21
  window file fails to load (no drive-window.js)
```
Whole suite: **402 tests, 402 pass, 0 fail**. `node --check` clean on the three scripts.

**Manual check for the developer.** Contact → Google Drive → *Files window* → a window with the files as icons; click one → details on the right; double-click or Enter → the preview inside the window (picture, PDF, .docx); search filters; List view; Sync re-reads; dark mode and German follow the CRM; a row's *Preview* button lands on that file; log out and open the window → the sign-in hint.

---

## Part 47 — Settings page: regrouped tabs, one card anatomy, consistent spacing

**Request.** "Fix the UI … especially in Settings → General the spacing is way off"; then: plan the Settings tabs first, look at the components and group them so they are easy to find. Decisions by the user: keep the horizontal tabs; regroup; personal settings get their own tab.

**Why the spacing was off.** `.settings-card` had no padding of its own; only `.settings-card-header`, `.settings-hint` and `.settings-row` inset their content (16px). Every other card child — the input rows, the notification list, the textarea, the language radios, the Save buttons and their message spans — sat at 0px against the card border under `overflow:hidden`, each card with a different ad-hoc gap (`margin-top:12px`, `padding:8px 0 4px`, `margin-top:10px`, none). Besides that: the pipelines card laid each pipeline's name *beside* its stages (`.pipeline-settings-row` was a row flexbox), empty-state rows were inset 10px while filled rows are 16px, stage rows and column rows fought over two paddings on the same element, and the tab bar had a double gap below it (page gap + `padding-top`).

**One card anatomy (`public/style.css`).** `header (h2 + optional action button)` → `p.settings-hint` → **body** (`.settings-card-body`: 8/16/16 padding, 12px gap; controls; a `.settings-card-actions` row holding Save + `<span class="workspace-name-msg">`) or **list** (`ul.settings-list` of rows; empty state `li.settings-empty` with the same 16px inset; optional body under it for a Save row). Single-input cards put the message span into the `.workspace-name-row` next to Save, so message and button share a line. New rules: `.settings-card-body`, `.settings-card-actions`, `.settings-empty`, `.settings-card.wide` (replaces inline `grid-column`), `.settings-card.danger` (red border + title), `.settings-tab-hint`, `.settings-tab.hidden`, `.text-danger`, `.row-label-strong`, `.col-cfg-locked …` (replaces inline opacity), `.onb-trigger-pipeline`; `.settings-tab-body` `padding-top: 0`; `.pipeline-settings-row` is now a column; `.settings-row.pipeline-stage-row, .settings-row.col-cfg-row` share one inset; `h3` in a card header styled like `h2`. The Settings section now contains **no** inline `margin` / `padding` / `gap` / `grid-column` / `opacity` (asserted).

**Regrouped tabs (`public/index.html`).**

| Tab | Who | Cards |
|---|---|---|
| Workspace (new; hidden for members) | owner | Workspace name · Supplier list name (from General) · Object type name (from Listings) · **Delete workspace** — last, full width, red |
| My preferences (new) | everyone | Language · **Appearance** (new dark-mode toggle, synced by `applyTheme`) · Timezone · Notification preferences — with the hint "These settings apply only to you" |
| Contacts | everyone | Contact stages · Custom fields · Contact columns · WhatsApp template (from General) |
| Deals | everyone | Pipelines · Onboarding trigger (owner) · Deal fields · Deal list columns |
| Listings | everyone | Fields · Columns |
| Tasks (now translated) | everyone | Task statuses · Custom fields |
| Team | everyone | Team members (gets a hint) · Invite codes (owner) |
| Integrations (new) | everyone | Miro board (from General) · pointer card to the Integrations page (lead webhook, engine keys, outgoing webhooks) |

"General" is gone. Default tab: Workspace for owners, My preferences for members (`loadSettings` hides `#settings-tab-workspace` for members and moves them off it). Every card keeps its element ids and handlers, so `clock.js`, `notifications.js`, `objects.js` (`updateObjectsNav`, `saveMiroUrl`) and the guided tour (`contacts`, `deals` tabs) work unchanged. `settings.js`: the five empty-state `<li>` and the two "no pipelines" `<p>` use `.settings-empty`; the pipeline header buttons use `.hstack-tight`; "+ Add stage" sits in a body/actions row; the trigger card's pipeline names use `.row-label-strong`. i18n (both dictionaries): `tab_workspace`, `tab_preferences`, `tab_tasks`, `tab_integrations`, `hint_preferences`, `set_appearance`, `hint_appearance`, `set_danger`, `hint_members`, `set_int_pointer`, `hint_int_pointer`, `btn_open_integrations`.

**Verification.** `tests/client/settings-layout.test.js` (16): the eight tabs in order, each pane once, General gone; Workspace tab hidden by default, Tasks translated; each card id in its expected pane and order; the "only you" hint, the danger card, members before invites; no inline spacing in the section; ≥ 14 bodies and every message span beside its button; `wide` cards; the CSS primitives and the fixed rhythm; `settings.js` without inline spacing, `.settings-empty` ≥ 7×, role-based default tab; `core.js` syncs the Appearance toggle; the tour targets existing tabs. `tests/client/onboarding-trigger.test.js`: the pinned opening tag now includes `wide` (deliberate). The section's `<div>`s balance (107/107).
```
BASELINE (pre-change public/)   LIVE
  4 / 17                        16 / 16
```
Whole suite: **419 tests, 419 pass, 0 fail**. `node --check` clean on `settings.js` and `core.js`. Existing pins green: `i18n` parity (all new `data-i18n` keys in both dictionaries), `field-key` (4 slugifiers in `settings.js`), `ui-onboarding` (Integrations-page cards untouched), `drive-ui`, `import-modal-layout`.

**Manual check for the developer.** Settings as owner opens on Workspace: three name cards with their message next to Save, the red Delete card last and full width; every card's content inset like its header; My preferences shows Language, Appearance (toggle follows the sidebar switch and vice versa), Timezone, Notifications under the "only you" line; Contacts has WhatsApp; Deals → Pipelines shows each pipeline's name above its stages with "+ Add stage" below them; Integrations has Miro and the button to the Integrations page; as a member the Workspace tab is absent and My preferences opens first; German translates every tab label except Listings (the workspace's own name); at ≤ 820px the tabs scroll and the cards stack.

**Left for a later pass (outside Settings).** Bare `<form>` under `.modal` in 13 modals has no padding (no `.modal > form` rule) while two modals use `.modal-body`; `#detail-body` / `#object-detail-body` lack `modal-body`; `class="data-table"` (undefined) on the engine tables and `var(--bg-secondary)` (undefined) on the webhook panel; a handful of off-scale inline values (22px, 18px, 14px) in `index.html` / `modals.js`.

Files: `public/index.html` (the Settings section, 632–928 → 368 lines), `public/style.css`, `public/js/settings.js`, `public/js/core.js`, `tests/client/settings-layout.test.js` (new), `tests/client/onboarding-trigger.test.js` (one regex), `tests/README.md`.

---

## Part 48 — Drive previews as an in-page popup; file rows show the whole name

**Request.** "Instead of having a new window for the preview I want it just a pop-up window, not a full tab; also instead of the dates and file size, just make the whole name there."

**Preview popup.** A new `#drive-preview-modal` (`public/index.html`, before the import modal) — the app's usual `.modal-overlay` with a wide modal (`.modal-drive-preview`, 96vw × 88vh) holding the file name, an *Open ↗* link and an `<iframe id="drive-preview-frame">`. `public/js/drive.js` `openDrivePreview(btn)` reads `data-preview` / `data-open` / `data-name` from the row's button, accepts only `https://drive.google.com/…` or `https://docs.google.com/…` (`DRIVE_PREVIEW_URL_RE`), sets the iframe `src` and shows the overlay; `closeDrivePreview()` removes the `src` (the viewer stops) and hides it. No `window.open` for previews any more; the *Files window* button (`openDriveWindow`) is unchanged for those who want the desktop view. The production CSP already frames both Google hosts (Part 44).

**Whole name.** `driveFileRow` renders icon · full name (`.drive-file-name` now wraps, no ellipsis, no `title`) · Preview · Open — the size and date spans are gone. In the files window `dwTile` shows icon + full name (the two-line clamp and the size line removed) and the preview pane's meta line shows the kind only.

**Verification.** `tests/client/drive-ui.test.js`: the row has the escaped full name in a plain span, the Preview button carries url + name as data attributes and no size/date text; `openDrivePreview` uses the modal (`drive-preview-modal`, `frame.src = url`, no `window.open`), `closeDrivePreview` unloads the frame; the modal markup has the empty iframe, title, Open link and close button. `tests/client/drive-window.test.js`: tile without meta/title; row Preview no longer opens a window. 
```
BASELINE (pre-change public/)   LIVE
  17 / 22                       22 / 22
```
Whole suite: **420 tests, 420 pass, 0 fail**. `node --check` clean on both scripts.

**Manual check.** Contact → Google Drive → Preview on a picture / PDF / .docx → the viewer opens over the CRM; × closes it and the viewer stops; long file names wrap fully; no sizes or dates in the rows or the files window.

Files: `public/index.html` (preview modal), `public/js/drive.js`, `public/js/drive-window.js`, `public/style.css`, the two test files.
