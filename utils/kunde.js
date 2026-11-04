/**
 * The Engine's view of a contact — "Kunde" (Developer Briefing §5.2 master data).
 *
 * German keys, the address grouped, nulls never undefined. Shared by
 *   routes/engine-api.js   GET /api/kunden/:id, PATCH /api/kunden/:id/status
 *   utils/engine.js        the kunde.angelegt / kunde.aktualisiert payloads
 * so the Engine sees one shape everywhere.
 *
 * masterDataChanges() decides whether a contact write is "master data changed"
 * (briefing §5.1, kunde.aktualisiert): it compares the columns the Engine's view
 * is built from and names the changed fields in the view's vocabulary.
 */

// Every column the view reads. Also the SELECT list for the Engine API.
const COLUMNS = `id, workspace_id, name, email, phone, company, contact_type,
  onboarding_status, drive_ordner_id, akte_version,
  rechtsform, ust_id, handelsregisternummer, webseite, quelle, strasse, plz, ort,
  created_at, updated_at`;

// The master data alone — what a kunde.* event carries in `daten`.
function stammdaten(c) {
  return {
    firma:                 c.company ?? null,
    ansprechpartner:       c.name ?? null,
    email:                 c.email ?? null,
    telefon:               c.phone ?? null,
    kontakt_typ:           c.contact_type ?? null,
    adresse:               { strasse: c.strasse ?? null, plz: c.plz ?? null, ort: c.ort ?? null },
    rechtsform:            c.rechtsform ?? null,
    ust_id:                c.ust_id ?? null,
    handelsregisternummer: c.handelsregisternummer ?? null,
    webseite:              c.webseite ?? null,
    quelle:                c.quelle ?? null,
  };
}

// The full record the Engine API answers with: id, master data, the Engine's own fields, timestamps.
function kundeView(c) {
  return {
    kunde_id:          c.id,
    ...stammdaten(c),
    onboarding_status: c.onboarding_status ?? 'kein_onboarding',
    drive_ordner_id:   c.drive_ordner_id ?? null,
    akte_version:      c.akte_version ?? 0,
    erstellt_am:       c.created_at ?? null,
    aktualisiert_am:   c.updated_at ?? null,
  };
}

// CRM column → the field's name in the Engine's view. The three address columns
// collapse into `adresse`.
const MASTER_FIELDS = {
  name: 'ansprechpartner', email: 'email', phone: 'telefon', company: 'firma', contact_type: 'kontakt_typ',
  rechtsform: 'rechtsform', ust_id: 'ust_id', handelsregisternummer: 'handelsregisternummer', webseite: 'webseite', quelle: 'quelle',
  strasse: 'adresse', plz: 'adresse', ort: 'adresse',
};

// null, undefined and '' are the same "empty"; surrounding whitespace never counts;
// email is compared case-insensitively (the CRM lower-cases it on some paths only).
// Exported as `normalize` for the Engine API's fill-empty-only comparison.
function norm(col, v) {
  if (v == null) return '';
  const s = String(v).trim();
  return col === 'email' ? s.toLowerCase() : s;
}

// German names of the master-data fields whose value differs between two contact
// rows. Only columns present in BOTH objects are compared, so a caller that writes
// a subset (e.g. the lead webhook: name, phone, company) passes just that subset.
// [] = nothing the Engine cares about changed → no kunde.aktualisiert.
function masterDataChanges(before, after) {
  const out = [];
  if (!before || !after) return out;
  for (const [col, name] of Object.entries(MASTER_FIELDS)) {
    if (!(col in before) || !(col in after)) continue;
    if (norm(col, before[col]) !== norm(col, after[col]) && !out.includes(name)) out.push(name);
  }
  return out;
}

// ── Documents (briefing §5.2: id, typ, dateiname, mimetype, groesse, erstellt_am, download_url) ──
const DOCUMENT_TYPES = ['vertrag', 'aufnahme', 'sonstiges'];

// The Engine fetches a document through the CRM (API key), never from storage directly:
// GET /api/dokumente/:id/download answers a time-limited signed link.
function documentUrl(base, id) {
  if (!base) return null;
  return `${String(base).replace(/\/+$/, '')}/api/dokumente/${Number(id)}/download`;
}

function dokumentView(d, base) {
  return {
    id:           Number(d.id),
    typ:          DOCUMENT_TYPES.includes(d.typ) ? d.typ : 'sonstiges',
    dateiname:    d.file_name ?? null,
    mimetype:     d.file_type || null,
    groesse:      Number(d.file_size) || 0,
    erstellt_am:  d.created_at ?? null,
    download_url: documentUrl(base, d.id),
  };
}

// ── Notes (briefing §5.2 "notizen": sales-call notes out, Engine result logs in) ──
// The CRM stores activity text as escaped HTML with <br> line breaks (the browser
// renders it as-is). The Engine gets and sends plain text; these two convert.
const ENGINE_AUTHOR = 'Upgrads Engine';
const NOTE_TYPES    = { note: 'notiz', call: 'anruf' };          // activities.type → the Engine's word

function activityText(content) {
  const s = String(content || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  return s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function activityHtml(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// One activity row → the Engine's note: { id, typ, inhalt, quelle, autor, vertrag_id, datum, uhrzeit, erstellt_am }.
function notizView(a) {
  const engine = a.source === 'engine';
  return {
    id:          Number(a.id),
    typ:         NOTE_TYPES[a.type] || 'notiz',
    inhalt:      activityText(a.content),
    quelle:      engine ? 'engine' : 'crm',
    autor:       engine ? ENGINE_AUTHOR : (a.logged_by_name ?? null),
    vertrag_id:  a.deal_id == null ? null : Number(a.deal_id),
    datum:       a.event_date ?? null,
    uhrzeit:     a.event_time ?? null,
    erstellt_am: a.created_at ?? null,
  };
}

// ── Communication (briefing §5.2 "kommunikation": subject, body, direction, timestamp, sender) ──
// The CRM has no mailbox: an e-mail or WhatsApp entry is what a team member logged by
// hand. So `betreff`, `richtung` and `absender` are honestly null, and `erfasst_von`
// names the person who logged it. `inhalt` and `zeitpunkt` are real.
const COMMUNICATION_TYPES = ['email', 'whatsapp'];

function kommunikationView(a) {
  const engine = a.source === 'engine';
  return {
    id:          Number(a.id),
    typ:         COMMUNICATION_TYPES.includes(a.type) ? a.type : 'email',
    betreff:     null,
    inhalt:      activityText(a.content),
    richtung:    null,
    absender:    null,
    erfasst_von: engine ? ENGINE_AUTHOR : (a.logged_by_name ?? null),
    vertrag_id:  a.deal_id == null ? null : Number(a.deal_id),
    datum:       a.event_date ?? null,
    uhrzeit:     a.event_time ?? null,
    zeitpunkt:   a.created_at ?? null,
  };
}

module.exports = {
  COLUMNS, MASTER_FIELDS, stammdaten, kundeView, masterDataChanges, normalize: norm,
  DOCUMENT_TYPES, documentUrl, dokumentView,
  ENGINE_AUTHOR, NOTE_TYPES, activityText, activityHtml, notizView,
  COMMUNICATION_TYPES, kommunikationView,
};
