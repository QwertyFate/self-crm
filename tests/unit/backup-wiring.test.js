// UNIT (static) — how the backup feature is wired in: server.js, the data-folder ignores, the
// npm scripts, the env example, and the zero-dependency pin on utils/tar.js and utils/backup.js.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('server.js', () => {
  const src = read('server.js');
  test('requires utils/backup, mounts routes/admin-backup right after admin-engine and before the catch-all', () => {
    assert.match(src, /const backup\s*=\s*require\('\.\/utils\/backup'\)/);
    const engine = src.indexOf("require('./routes/admin-engine')"), bk = src.indexOf("app.use('/api/admin',         require('./routes/admin-backup'))"), catchAll = src.indexOf("app.get('*'");
    assert.ok(engine > 0 && bk > engine && bk < catchAll);
  });
  test('start() launches the daily scheduler after the retry worker, only when enabled; stop() stops it first', () => {
    const start = src.slice(src.indexOf('async function start('), src.indexOf('async function stop('));
    assert.ok(start.indexOf('engine.startRetryWorker()') < start.indexOf('if (backup.schedulerEnabled()) backup.startScheduler({ getDb: embedded.getDb, pool })'));
    const stop = src.slice(src.indexOf('async function stop('), src.indexOf('if (require.main === module)'));
    assert.match(stop, /async function stop\(\) \{\s*backup\.stopScheduler\(\);\s*engine\.stopRetryWorker\(\);/);
    assert.equal((src.match(/process\.exit\(/g) || []).length, 1, 'still exactly one process.exit');
  });
});

describe('embedded.js', () => {
  test('exports getDb() and loadPGlite(), and start() uses the shared loader', () => {
    const src = read('embedded.js');
    assert.match(src, /function getDb\(\) \{ return db; \}/);
    assert.match(src, /function loadPGlite\(\) \{ return require\('@electric-sql\/pglite'\)\.PGlite; \}/);
    assert.match(src, /secrets, sessionSecret, fileKey, start, stop, getDb, loadPGlite,/);
    assert.equal((src.match(/require\('@electric-sql\/pglite'\)/g) || []).length, 1, 'one place names the package');
  });
});

describe('the backups folder', () => {
  test('nodemon ignores backups/** (an hourly archive must not restart the dev server) and git ignores backups/', () => {
    assert.ok(JSON.parse(read('nodemon.json')).ignore.some(p => /^backups\//.test(p)));
    assert.match(read('.gitignore'), /^backups\/$/m);
  });
  test('npm scripts: backup and restore, both loading .env the way start does', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.scripts.backup, 'node --env-file-if-exists=.env scripts/backup.js');
    assert.equal(pkg.scripts.restore, 'node --env-file-if-exists=.env scripts/restore.js');
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'backup.js')) && fs.existsSync(path.join(ROOT, 'scripts', 'restore.js')));
  });
  test('.env.example documents BACKUP_DIR, BACKUP_KEEP and BACKUPS; the README names the commands', () => {
    const env = read('.env.example');
    for (const v of ['BACKUP_DIR', 'BACKUP_KEEP', 'BACKUPS']) assert.match(env, new RegExp(`^# ${v}=`, 'm'), v);
    assert.match(read('README.md'), /npm run backup/); assert.match(read('README.md'), /npm run restore/);
  });
});

describe('zero dependencies', () => {
  for (const rel of ['utils/tar.js', 'utils/backup.js', 'routes/admin-backup.js', 'scripts/backup.js', 'scripts/restore.js']) {
    test(`${rel} requires only Node builtins and this repo's files`, () => {
      const reqs = [...read(rel).matchAll(/require\(([^)]+)\)/g)].map(m => m[1]);
      for (const r of reqs) assert.ok(/^'(fs|path|zlib|stream|stream\/promises|readline|crypto|os|express)'$/.test(r) || /^'\.\.?\//.test(r) || /^path\.join\(/.test(r), `${rel}: ${r}`);
    });
  }
  test('routes/admin-backup.js gates first and never takes a transaction client', () => {
    const src = read('routes/admin-backup.js');
    assert.ok(src.indexOf("router.use('/backup', requireAdmin)") < src.indexOf("router.get('/backup/list'"));
    assert.doesNotMatch(src, /pool\.connect\(/);
  });
});
