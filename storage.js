/* ═══════════════════════════════════════════════════════════════════════════
   FILE STORAGE — Supabase Storage, used by task attachments and contact
   documents.

   OPTIONAL BY DESIGN. Without SUPABASE_URL and SUPABASE_SERVICE_KEY,
   getClient() returns null: the upload functions throw a message that tells
   you which variables to set, the delete functions quietly do nothing, and the
   rest of the app is unaffected.

   TWO BUCKETS
     "task-attachments"   (public)  <workspaceId>/<taskId>/<timestamp>-<name>
                          Used by routes/task-attachments.js. The returned URL
                          is a PUBLIC Supabase URL — anyone with the link can
                          read it, without a CRM session.
     "contact-documents"  (PRIVATE) <workspaceId>/<contactId>/<timestamp>-<name>
                          Used by routes/contact-documents.js and the Engine's
                          GET /api/dokumente/:id/download. Nothing is public:
                          every read goes through signedDocumentUrl(), a link
                          that expires. Create this bucket in Supabase as
                          PRIVATE; SUPABASE_DOCS_BUCKET overrides the name.

   The workspace prefix keeps one tenant's files out of another's listing, and
   the timestamp means two uploads of the same filename never collide (upsert
   is off, so a collision would otherwise be an error). Filenames are
   sanitised to [A-Za-z0-9._-]; the routes cap the size at 10 MB. The file TYPE
   is not restricted.
   ═══════════════════════════════════════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET       = 'task-attachments';
const DOCS_BUCKET  = process.env.SUPABASE_DOCS_BUCKET || 'contact-documents';

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

const NOT_CONFIGURED = 'Supabase storage not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to your .env';
const safeName = name => String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');

async function uploadFile(workspaceId, taskId, buffer, originalName, mimeType) {
  const supabase = getClient();
  if (!supabase) throw new Error(NOT_CONFIGURED);

  const storagePath = `${workspaceId}/${taskId}/${Date.now()}-${safeName(originalName)}`;

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

// ── Contact documents (private bucket, signed URLs only) ─────────────────────
async function uploadDocument(workspaceId, contactId, buffer, originalName, mimeType) {
  const supabase = getClient();
  if (!supabase) throw new Error(NOT_CONFIGURED);
  const storagePath = `${workspaceId}/${contactId}/${Date.now()}-${safeName(originalName)}`;
  const { error } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
  return { storagePath };
}

async function deleteDocument(storagePath) {
  const supabase = getClient();
  if (!supabase) return;
  await supabase.storage.from(DOCS_BUCKET).remove([storagePath]);
}

// A link that works for `expiresSec` seconds (default 10 minutes), then dies.
async function signedDocumentUrl(storagePath, expiresSec = 600) {
  const supabase = getClient();
  if (!supabase) throw new Error(NOT_CONFIGURED);
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(storagePath, expiresSec);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not sign the document URL');
  return data.signedUrl;
}

module.exports = { uploadFile, deleteFile, uploadDocument, deleteDocument, signedDocumentUrl, DOCS_BUCKET };
