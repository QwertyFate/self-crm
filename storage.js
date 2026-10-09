/* ═══════════════════════════════════════════════════════════════════════════
   FILE STORAGE — Supabase Storage, used only by task attachments.

   OPTIONAL BY DESIGN. Without SUPABASE_URL and SUPABASE_SERVICE_KEY,
   getClient() returns null: uploadFile() throws a message that tells you which
   variables to set, deleteFile() quietly does nothing, and the rest of the app
   is unaffected.

   LAYOUT IN THE BUCKET ("task-attachments"):
     <workspaceId>/<taskId>/<timestamp>-<sanitised original name>
   The workspace prefix keeps one tenant's files out of another's listing, and
   the timestamp means two uploads of the same filename never collide
   (upsert is off, so a collision would otherwise be an error).

   WHAT IS AND IS NOT CHECKED  the filename is sanitised to [A-Za-z0-9._-] and
   the route caps the size at 10 MB. The file TYPE is not restricted, and the
   returned URL is a public Supabase URL — anyone with the link can read it,
   without a CRM session.

   Callers: routes/task-attachments.js only.
   ═══════════════════════════════════════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET      = 'task-attachments';

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function uploadFile(workspaceId, taskId, buffer, originalName, mimeType) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase storage not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to your .env');

  const safeName    = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${workspaceId}/${taskId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (error) throw new Error(error.message);

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return { publicUrl, storagePath };
}

async function deleteFile(storagePath) {
  const supabase = getClient();
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

module.exports = { uploadFile, deleteFile };
