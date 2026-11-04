// STATIC tests: the process never goes down because of one bad request, listener
// or timer — the two process-level nets in server.js, and the order of the
// protections on the Engine paths (body-error shaping before anything else).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { ROOT } = require('../helpers/load-route');

const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

describe('process-level nets', () => {
  test('an unhandled promise rejection is logged, not fatal', () => {
    assert.match(src, /process\.on\('unhandledRejection', \(reason\) => \{\s*console\.error\('Unhandled promise rejection:', reason\);\s*\}\);/);
  });
  test('an uncaught exception is logged and the process keeps serving (npm run dev / nodemon does not restart a crashed process)', () => {
    assert.match(src, /process\.on\('uncaughtException', \(err\) => \{\s*console\.error\('Uncaught exception \(kept running\):', err\);\s*\}\);/);
    assert.doesNotMatch(src.slice(src.indexOf("process.on('uncaughtException'"), src.indexOf("process.on('uncaughtException'") + 300), /process\.exit/, 'the handler never exits');
    assert.ok(src.indexOf("process.on('uncaughtException'") < src.indexOf('app.set('), 'installed before any middleware runs');
  });
  test('the only process.exit is the deliberate one when the database cannot be reached at boot', () => {
    const exits = [...src.matchAll(/process\.exit\(/g)];
    assert.equal(exits.length, 1);
    assert.match(src.slice(exits[0].index - 120, exits[0].index), /Database init failed/);
  });
});

describe('Engine paths: every failure is an answer, never a crash', () => {
  test('body-parser errors are shaped right after express.json(), before the log, the limiter, the gate and the routers', () => {
    const i = s => src.indexOf(s);
    const json = i('app.use(express.json());'), body = i("app.use('/api/kunden',    engineGate.engineBodyErrors)"), log = i("app.use('/api/kunden',        engineRequestLog)"), gate = i("app.use('/api/kunden',        engineGate)"), router = i("app.use('/api/kunden',        require('./routes/engine-api'))");
    assert.ok(json > 0 && body > json && body < log && log < gate && gate < router);
  });
  test('the global error handler stays last and answers JSON (413 for a too-large body, 500 otherwise)', () => {
    const handler = src.slice(src.indexOf('app.use((err, req, res, next) => {'));
    assert.match(handler, /entity\.too\.large[\s\S]*?res\.status\(413\)\.json/);
    assert.match(handler, /res\.status\(500\)\.json\(\{ error: 'Internal server error' \}\)/);
    assert.ok(src.indexOf('app.use((err, req, res, next) => {') > src.lastIndexOf("app.use('/api/"), 'after every mount');
  });
});
