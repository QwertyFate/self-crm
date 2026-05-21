const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET      = 'task-attachments';

// Returns null if Supabase credentials aren't configured yet
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
