#!/usr/bin/env node
// npm run backup [folder] — write one backup archive with the CRM STOPPED.
//
// With the CRM running, use the admin console instead (Platform Defaults → Backups → "Save a
// backup now" or "Download backup"); this script takes data/pgdata.lock and refuses while a live
// process holds it (exit 2). Embedded database only (exit 1 with DATABASE_URL set).
// The archive goes to ./backups (or BACKUP_DIR, or the folder given as the first argument).
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const embedded = require(path.join(ROOT, 'embedded.js'));
const backup   = require(path.join(ROOT, 'utils', 'backup.js'));

(async () => {
  if (!backup.isEmbedded()) {
    console.error('DATABASE_URL is set: this backup is for the embedded database only. Use pg_dump for a Postgres server.');
    process.exitCode = 1; return;
  }
  try { embedded._acquireLock(); }
  catch (e) {
    console.error(e.message);
    console.error('While the CRM runs, use the admin console: Platform Defaults → Backups → "Save a backup now". Or stop it first.');
    process.exitCode = 2; return;
  }
  process.on('SIGINT', () => { embedded._releaseLock(); process.exit(130); });
  let db = null;
  try {
    if (!fs.existsSync(path.join(embedded.PGDATA_DIR, 'PG_VERSION'))) {
      console.error(`Nothing to back up yet: ${embedded.PGDATA_DIR} holds no database. Start the CRM once first.`);
      process.exitCode = 1; return;
    }
    const PGlite = embedded.loadPGlite();
    db = await PGlite.create({ dataDir: embedded.PGDATA_DIR });
    const dir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
    const r = await backup.saveBackup({ db, pool: null, dir, log: { log() {}, warn: m => console.warn(m), error: (...a) => console.error(...a) } });
    console.log(`Backup written: ${r.path}`);
    console.log(`  ${(r.size / 1048576).toFixed(2)} MB — ${r.manifest.files.count} file(s), counts ${JSON.stringify(r.manifest.counts)}`);
    if (r.pruned.length) console.log(`  Pruned: ${r.pruned.join(', ')}`);
  } catch (e) {
    console.error('Backup failed:', e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close().catch(() => {});
    embedded._releaseLock();
  }
})();
