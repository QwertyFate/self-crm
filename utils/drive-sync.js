/**
 * Drive file sync — keeps contact_drive_files in step with each contact's
 * public Drive folder (contacts.drive_ordner_id).
 *
 *   syncContact(ws, id)   read the folder through the API-key client, upsert
 *                         the rows, drop the vanished ones, stamp the contact
 *   listFiles(ws, id)     the stored rows, described for the UI
 *   syncDue(...)          the contacts whose last sync is older than N minutes
 *   startWorker(...)      periodic syncDue, like the engine webhook worker
 *
 * A Drive failure never blanks a list: the old rows stay and the contact gets
 * drive_sync_error so the UI can say why. Everything is scoped by workspace_id
 * — one API key serves every workspace, the rows never cross one.
 */
const { parseDriveFolderId, describeFile, createDriveClient } = require('./google-drive');

const FILE_ID_RE = /^[A-Za-z0-9_-]+$/;

function createDriveSync({ pool, drive, now = () => new Date(), log = console } = {}) {

  async function listFiles(workspaceId, contactId) {
    const { rows } = await pool.query(
      `SELECT file_id, name, mime_type, size, modified_at, synced_at FROM contact_drive_files
        WHERE workspace_id=$1 AND contact_id=$2
        ORDER BY (mime_type = 'application/vnd.google-apps.folder') DESC, name ASC`,
      [workspaceId, contactId]
    );
    return rows.map(describeFile);
  }

  async function syncContact(workspaceId, contactId) {
    const { rows: [c] } = await pool.query('SELECT drive_ordner_id FROM contacts WHERE id=$1 AND workspace_id=$2', [contactId, workspaceId]);
    if (!c) return { error: 'not_found' };

    const folderId = parseDriveFolderId(c.drive_ordner_id || '');
    if (!folderId) {                                       // no (valid) folder: nothing to keep
      await pool.query('DELETE FROM contact_drive_files WHERE contact_id=$1 AND workspace_id=$2', [contactId, workspaceId]);
      await pool.query('UPDATE contacts SET drive_file_count=0, drive_synced_at=NOW(), drive_sync_error=NULL WHERE id=$1 AND workspace_id=$2', [contactId, workspaceId]);
      return { folder_id: null, synced_at: now(), sync_error: null, files: [] };
    }

    let raw;
    try {
      raw = await drive.listFolder(folderId);
    } catch (e) {
      const code = e && e.code ? e.code : 'upstream';
      await pool.query('UPDATE contacts SET drive_synced_at=NOW(), drive_sync_error=$1 WHERE id=$2 AND workspace_id=$3', [code, contactId, workspaceId]);
      return { folder_id: folderId, synced_at: now(), sync_error: code, files: await listFiles(workspaceId, contactId) };
    }

    const files = raw.filter(f => FILE_ID_RE.test(String(f.id ?? '')) && String(f.name ?? '').trim());
    const ids   = files.map(f => String(f.id));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM contact_drive_files WHERE contact_id=$1 AND workspace_id=$2 AND NOT (file_id = ANY($3::text[]))', [contactId, workspaceId, ids]);
      if (files.length) {
        const values = [], params = [];
        files.forEach((f, i) => {
          const b = i * 7;
          values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},NOW())`);
          params.push(workspaceId, contactId, String(f.id), String(f.name).trim(), f.mimeType || null,
            f.size != null && f.size !== '' && !Number.isNaN(Number(f.size)) ? Number(f.size) : null, f.modifiedTime || null);
        });
        await client.query(
          `INSERT INTO contact_drive_files (workspace_id, contact_id, file_id, name, mime_type, size, modified_at, synced_at)
           VALUES ${values.join(',')}
           ON CONFLICT (contact_id, file_id) DO UPDATE SET name=EXCLUDED.name, mime_type=EXCLUDED.mime_type, size=EXCLUDED.size, modified_at=EXCLUDED.modified_at, synced_at=EXCLUDED.synced_at`,
          params
        );
      }
      await client.query('UPDATE contacts SET drive_file_count=$1, drive_synced_at=NOW(), drive_sync_error=NULL WHERE id=$2 AND workspace_id=$3', [files.length, contactId, workspaceId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return { folder_id: folderId, synced_at: now(), sync_error: null, files: await listFiles(workspaceId, contactId) };
  }

  // Contacts with a folder whose last sync attempt is older than olderThanMs
  // (never-synced first), one at a time so a slow folder never fans out.
  async function syncDue({ olderThanMs = 60 * 60_000, limit = 25 } = {}) {
    const summary = { checked: 0, synced: 0, failed: 0 };
    if (!drive.configured) return summary;
    const cutoff = new Date(now().getTime() - olderThanMs);
    const { rows } = await pool.query(
      `SELECT id, workspace_id FROM contacts
        WHERE drive_ordner_id IS NOT NULL AND drive_ordner_id <> '' AND (drive_synced_at IS NULL OR drive_synced_at < $1)
        ORDER BY drive_synced_at NULLS FIRST LIMIT $2`,
      [cutoff, limit]
    );
    for (const r of rows) {
      summary.checked++;
      try {
        const res = await syncContact(r.workspace_id, r.id);
        if (res.error || res.sync_error) summary.failed++; else summary.synced++;
      } catch (e) {
        summary.failed++;
        log.error('drive sync failed:', r.workspace_id, r.id, e.message);
      }
    }
    return summary;
  }

  function startWorker({ intervalMs = 15 * 60_000, olderThanMs = 60 * 60_000, initialDelayMs = 30_000 } = {}) {
    if (!drive.configured) { log.log('drive sync: GOOGLE_API_KEY not set — folder files are not synced'); return { stop() {}, tick: async () => ({ checked: 0, synced: 0, failed: 0 }) }; }
    let running = false;
    const tick = async () => {
      if (running) return null;                          // overlap guard
      running = true;
      try {
        const s = await syncDue({ olderThanMs });
        if (s.checked) log.log(`drive sync: ${s.synced} ok, ${s.failed} failed of ${s.checked}`);
        return s;
      } catch (e) {
        log.error('drive sync tick failed:', e.message);
        return null;
      } finally { running = false; }
    };
    const first = setTimeout(tick, initialDelayMs);  first.unref?.();
    const timer = setInterval(tick, intervalMs);     timer.unref?.();
    return { stop() { clearTimeout(first); clearInterval(timer); }, tick };
  }

  return { syncContact, listFiles, syncDue, startWorker };
}

// Module singleton for the routes and the worker: the key is re-read on each
// call so it can change without a restart (and so tests can set it).
let singleton = null, singletonKey;
function getDriveSync() {
  const key = process.env.GOOGLE_API_KEY || '';
  if (!singleton || singletonKey !== key) {
    const { pool } = require('../db');
    singleton = createDriveSync({ pool, drive: createDriveClient({ apiKey: key }) });
    singletonKey = key;
  }
  return singleton;
}

function startDriveSyncWorker(opts = {}) {
  const minutes = (name, dflt) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? n * 60_000 : dflt; };
  return getDriveSync().startWorker({
    intervalMs:  minutes('DRIVE_SYNC_INTERVAL_MIN', 15 * 60_000),
    olderThanMs: minutes('DRIVE_SYNC_MAX_AGE_MIN',  60 * 60_000),
    ...opts,
  });
}

module.exports = { createDriveSync, getDriveSync, startDriveSyncWorker };
