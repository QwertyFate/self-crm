#!/usr/bin/env node
// npm run restore -- <archive.tar.gz> [--yes] [--force] — put a backup back, with the CRM STOPPED.
//
// What happens (utils/backup.js restoreArchive): the archive is validated first; the current
// data/pgdata, data/files and data/secrets.json are moved aside as *.before-restore-<stamp>
// (nothing is deleted); files and secrets are extracted; the database is loaded into a fresh
// pgdata through PGlite and checked with one query. If anything fails after the move, the
// previous data is put back. --force restores across a Postgres major-version mismatch
// (PGlite must still be able to open it). Exit 2 while the CRM runs, 1 on any other failure.
const fs   = require('fs');
const path = require('path');
const readline = require('readline');
const ROOT = path.join(__dirname, '..');
const embedded = require(path.join(ROOT, 'embedded.js'));
const backup   = require(path.join(ROOT, 'utils', 'backup.js'));

const args  = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const file  = args.find(a => !a.startsWith('--'));

(async () => {
  if (!file) { console.error('Usage: npm run restore -- backups/<archive>.tar.gz [--yes] [--force]'); process.exitCode = 1; return; }
  if (!backup.isEmbedded()) { console.error('DATABASE_URL is set: restore is for the embedded database only.'); process.exitCode = 1; return; }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) { console.error(`No such file: ${abs}`); process.exitCode = 1; return; }
  console.log(`Restore  ${abs}`);
  console.log(`into     ${embedded.DATA_DIR}`);
  console.log('The current pgdata, files and secrets.json (if present) are moved aside as *.before-restore-<stamp>; nothing is deleted.');
  console.log('The CRM must be stopped.');
  if (!flags.has('--yes')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(r => rl.question('Type yes to continue: ', r)); rl.close();
    if (answer.trim().toLowerCase() !== 'yes') { console.log('Cancelled.'); return; }
  }
  try {
    const r = await backup.restoreArchive(abs, { force: flags.has('--force'), log: { log() {}, warn: m => console.warn(m), error: (...a) => console.error(...a) } });
    console.log(`Restored: ${r.files} file(s) extracted, ${r.workspaces ?? '?'} workspace(s) in the database (backup from ${r.manifest.createdAt}).`);
    for (const m of r.movedAside) console.log(`  kept: ${m.to}`);
    console.log('Start the CRM again with npm run dev (or npm start). Delete the *.before-restore-* copies once you are happy.');
  } catch (e) {
    console.error('Restore failed:', e.message);
    process.exitCode = e.code === 'SERVER_RUNNING' ? 2 : 1;
  }
})();
