// EMBEDDED MODE — the wiring around embedded.js, pinned statically: boot order in server.js,
// the session secret, the /files mount, the dependencies, and the two files that keep the
// data folder out of nodemon's watch list and out of git.
//
// nodemon matters more than it looks: PGlite writes into data/pgdata on every statement and
// the first boot writes data/secrets.json. Unignored, each write would restart the server —
// mid-write, on the first boot, before initdb finished.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('server.js', () => {
  const src = read('server.js');
  test('start(): the embedded database BEFORE initDb(), and listens only after both; node server.js runs it, a test can require it', () => {
    assert.match(src, /if \(require\.main === module\) \{\s*start\(\)\.catch/);
    assert.match(src, /module\.exports = \{ app, httpServer, io, start, stop \}/);
    const start = src.indexOf('await embedded.start(pool)'), init = src.indexOf('await initDb()'), listen = src.indexOf('httpServer.listen(');
    assert.ok(start > 0 && init > start && listen > init, `order: start ${start}, initDb ${init}, listen ${listen}`);
    assert.match(src, /const embedded\s*=\s*require\('\.\/embedded'\)/);
  });
  test('the session secret comes from embedded.sessionSecret(): SESSION_SECRET, else a generated one — never a constant', () => {
    assert.match(src, /secret:\s*embedded\.sessionSecret\(\)/);
    assert.doesNotMatch(src, /change-me-in-production/);
  });
  test('/files is mounted before the catch-all', () => {
    const mount = src.indexOf("app.use('/files',"), catchAll = src.indexOf("app.get('*'");
    assert.ok(mount > 0 && mount < catchAll);
    assert.match(src, /app\.use\('\/files',\s*require\('\.\/routes\/files'\)\)/);
  });
});

describe('dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  test('PGlite and its socket server are regular dependencies (npm install is the whole setup)', () => {
    assert.ok(pkg.dependencies['@electric-sql/pglite']);
    assert.ok(pkg.dependencies['@electric-sql/pglite-socket']);
    assert.ok(pkg.dependencies['pg'], 'the routes still speak through pg');
  });
  test('the installed pglite is the exact version pglite-socket peers on (it pins one)', () => {
    const socket = JSON.parse(read('node_modules/@electric-sql/pglite-socket/package.json'));
    const pglite = JSON.parse(read('node_modules/@electric-sql/pglite/package.json'));
    assert.equal(pglite.version, socket.peerDependencies['@electric-sql/pglite']);
  });
});

describe('the data folder', () => {
  test('nodemon ignores data/ (and logs/)', () => {
    const cfg = JSON.parse(read('nodemon.json'));
    assert.ok(cfg.ignore.some(p => /^data\//.test(p)), JSON.stringify(cfg.ignore));
    assert.ok(cfg.ignore.some(p => /^logs\//.test(p)));
  });
  test('git ignores data/', () => {
    assert.match(read('.gitignore'), /^data\/$/m);
  });
  test('.env.example says a .env is optional and lists only what this local build needs', () => {
    const env = read('.env.example');
    assert.match(env, /No \.env is needed/);
    for (const v of ['BASE_URL', 'PORT', 'BACKUP_DIR', 'BACKUP_KEEP', 'BACKUPS', 'NODE_ENV']) assert.match(env, new RegExp(`^#? ?${v}=`, 'm'), v);
    // hosted-mode, Supabase and e-mail settings are documented in the README's table and in code, not here
    assert.doesNotMatch(env, /DATABASE_URL|SUPABASE|SMTP|ADMIN_SECRET|OPEN_SIGNUP|OPEN_ADMIN|APP_URL|DATA_DIR/);
  });
});

describe('START.md — the three-command guide', () => {
  test('exists, names Node 22, npm install, npm run dev, the boot line and the local address', () => {
    const g = read('START.md');
    for (const re of [/nodejs\.org/, /npm install/, /npm run dev/, /CRM running at http:\/\/localhost:4001/, /localhost:4001\/adminconsole/, /npm run backup/, /npm run restore -- backups\//, /BASE_URL=https:\/\/crm\.upgrads\.de/, /Ctrl \+ C/]) assert.match(g, re, String(re));
    assert.match(read('README.md'), /\[START\.md\]\(START\.md\)/, 'the README points newcomers at it');
  });
});

describe('routes/files.js gates', () => {
  const src = read('routes/files.js');
  test('documents are signed and sessionless; attachments need the session; no router-wide requireAuth', () => {
    assert.doesNotMatch(src, /^router\.use\(requireAuth\)/m, 'router-wide requireAuth would lock the Engine out of signed document links');
    assert.match(src, /router\.get\('\/documents\/\*',\s*async/);
    assert.match(src, /router\.get\('\/task-attachments\/\*',\s*requireAuth,/);
    assert.match(src, /verifySignedDocument\(storagePath, req\.query\.exp, req\.query\.sig\)/);
  });
  test('both handlers answer 404 when the Supabase backend is active (nothing is stored locally then)', () => {
    assert.equal((src.match(/if \(storage\.BACKEND !== 'local'\) return notFound\(res\);/g) || []).length, 2);
  });
});
