/* ═══════════════════════════════════════════════════════════════════════════
   /api/admin/backup — the platform console's Backups card (utils/backup.js).
   Cross-tenant like the rest of /api/admin; gated by requireAdmin
   (middleware/admin-auth.js); embedded database only — with DATABASE_URL set
   every path answers 503 (use pg_dump there).

     GET  /backup          a fresh archive, streamed as a download
     GET  /backup/list     { dir, keep, schedulerEnabled, busy, scheduler, backups }
     POST /backup/now      write one into the backups folder, prune, answer it

   The download takes its snapshot and scans the files BEFORE sending headers,
   so every failure that can be answered as JSON is (409 while another backup
   is being written, 500 otherwise); once bytes flow, an error ends the
   response and is logged — never thrown into the process.
   ═══════════════════════════════════════════════════════════════════════════ */
const express      = require('express');
const router       = express.Router();
const { pipeline } = require('stream/promises');
const { pool }     = require('../db');
const embedded     = require('../embedded');
const requireAdmin = require('../middleware/admin-auth');
const backup       = require('../utils/backup');

router.use('/backup', requireAdmin);
router.use('/backup', (req, res, next) => {
  if (backup.isEmbedded()) return next();
  res.status(503).json({ error: 'Backups are available only with the embedded database (no DATABASE_URL). With a Postgres server, use pg_dump.' });
});

router.get('/backup/list', async (req, res, next) => {
  try {
    res.json({
      dir: backup.backupDir(), keep: backup.keepCount(), schedulerEnabled: backup.schedulerEnabled(), busy: backup.isBusy(),
      scheduler: backup.schedulerStatus(), backups: await backup.listBackups(),
    });
  } catch (e) { next(e); }
});

router.post('/backup/now', async (req, res, next) => {
  try {
    const r = await backup.saveBackup({ db: embedded.getDb(), pool });
    res.json({ success: true, backup: { name: r.name, size: r.size, createdAt: r.createdAt }, pruned: r.pruned });
  } catch (e) {
    if (e.code === 'BUSY') return res.status(409).json({ error: e.message });
    next(e);
  }
});

router.get('/backup', async (req, res, next) => {
  let archive;
  try { archive = await backup.createArchive({ db: embedded.getDb(), pool }); }
  catch (e) {
    if (e.code === 'BUSY') return res.status(409).json({ error: e.message });
    return next(e);
  }
  res.set({
    'Content-Type': 'application/gzip',
    'Content-Disposition': `attachment; filename="${archive.name}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  try { await pipeline(archive.stream, res); }
  catch (e) { console.error('backup download:', e.message); if (!res.destroyed) res.destroy(); }
});

module.exports = router;
