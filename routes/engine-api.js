/**
 * Engine API — the endpoints the UPGRADS Onboarding Engine calls (Developer
 * Briefing §5.2 read/write, §5.3 status values, §5.4 linkage fields, §8 errors).
 *
 * Mounted at /api/kunden. Every request authenticates with an API key
 * (middleware/engine-auth.js), which sets req.workspaceId; every query is
 * scoped to that workspace. Errors use { fehler: { code, nachricht } } — never
 * HTTP 200 with an error body, and never the SPA page for an unknown path.
 *
 * This file deliberately does NOT require utils/engine.js: a status change made
 * *by* the Engine must not be echoed back *to* the Engine as a webhook, or the
 * two systems would loop. Outbound events are emitted only by CRM-user actions.
 *
 * Stage 1 (this file): GET /:id, PATCH /:id/status. Later stages add PATCH /:id
 * (fill-empty-only master data), /notizen, /kommunikation, /dokumente.
 */
const express           = require('express');
const path              = require('path');
const router            = express.Router();
const { pool }          = require('../db');
const engineAuth        = require('../middleware/engine-auth');
const { runIdempotent } = require('../utils/idempotency');

router.use(engineAuth);

// GET /api/kunden/openapi.json — this API's OpenAPI 3.1 description (briefing §8
// "an OpenAPI specification is fully sufficient"), for the Engine team's tooling.
// Declared before the /:id routes so the word is not parsed as a customer id.
const OPENAPI_FILE = path.join(__dirname, '..', 'docs', 'openapi.json');
router.get('/openapi.json', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/json').sendFile(OPENAPI_FILE);
});

const ONBOARDING_STATUSES = [
  'kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht',
  'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen',
];
const MAX_DRIVE_ID = 255;

const fehler = (res, status, code, nachricht) => res.status(status).json({ fehler: { code, nachricht } });

// The Engine's view of a contact (German keys, address grouped, nulls never undefined)
// and the SELECT list behind it live in utils/kunde.js, shared with the kunde.* webhooks.
// kunde_id is the CRM contact id (numeric) — the same value the webhooks carry.
const { COLUMNS, kundeView, normalize, dokumentView, notizView, activityHtml, NOTE_TYPES, kommunikationView, COMMUNICATION_TYPES } = require('../utils/kunde');
const baseUrl = require('../utils/base-url');

const parseId = raw => (/^\d+$/.test(String(raw)) ? Number(raw) : null);
const has     = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// GET /api/kunden/:id — master data
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fehler(res, 400, 'ungueltige_id', 'Die Kunden-ID muss eine ganze Zahl sein.');
    const { rows: [c] } = await pool.query(`SELECT ${COLUMNS} FROM contacts WHERE id=$1 AND workspace_id=$2`, [id, req.workspaceId]);
    if (!c) return fehler(res, 404, 'nicht_gefunden', 'Kunde nicht gefunden.');
    res.json(kundeView(c));
  } catch (e) { next(e); }
});

// PATCH /api/kunden/:id/status — onboarding status, plus the two linkage fields
// from §5.4 when the Engine sends them (drive_ordner_id, akte_version). Each is
// touched only when its key is present; drive_ordner_id present with null clears it.
// Idempotent via Idempotency-Key. Emits NO outbound webhook (see header comment).
router.patch('/:id/status', (req, res, next) =>
  runIdempotent(req, res, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return fehler(res, 400, 'ungueltige_id', 'Die Kunden-ID muss eine ganze Zahl sein.');

    const body   = req.body && typeof req.body === 'object' ? req.body : {};
    const status = body.onboarding_status;
    if (typeof status !== 'string' || !ONBOARDING_STATUSES.includes(status)) {
      return fehler(res, 422, 'ungueltiger_status', `onboarding_status muss einer der Werte ${ONBOARDING_STATUSES.join(', ')} sein.`);
    }

    const hasDrive = has(body, 'drive_ordner_id');
    const drive    = body.drive_ordner_id;
    if (hasDrive && drive !== null && (typeof drive !== 'string' || drive.length > MAX_DRIVE_ID)) {
      return fehler(res, 422, 'ungueltige_daten', `drive_ordner_id muss ein Text mit höchstens ${MAX_DRIVE_ID} Zeichen oder null sein.`);
    }

    const hasVersion = has(body, 'akte_version');
    const version    = body.akte_version;
    if (hasVersion && !(Number.isInteger(version) && version >= 0)) {
      return fehler(res, 422, 'ungueltige_daten', 'akte_version muss eine ganze Zahl ≥ 0 sein.');
    }

    const sets   = ['onboarding_status = $1', 'updated_at = NOW()'];
    const params = [status];
    if (hasDrive)   { params.push(drive);   sets.push(`drive_ordner_id = $${params.length}`); }
    if (hasVersion) { params.push(version); sets.push(`akte_version = $${params.length}`); }
    params.push(id, req.workspaceId);

    const { rows: [c] } = await pool.query(
      `UPDATE contacts SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND workspace_id = $${params.length}
        RETURNING ${COLUMNS}`,
      params
    );
    if (!c) return fehler(res, 404, 'nicht_gefunden', 'Kunde nicht gefunden.');
    res.json(kundeView(c));
  }).catch(next)
);

// GET /api/kunden/:id/dokumente — the customer's documents (briefing §5.2 read):
// id, typ, dateiname, mimetype, groesse, erstellt_am, download_url. The bytes come
// from GET /api/dokumente/:id/download (routes/engine-dokumente.js) with the same key.
router.get('/:id/dokumente', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fehler(res, 400, 'ungueltige_id', 'Die Kunden-ID muss eine ganze Zahl sein.');
    const { rows: [c] } = await pool.query('SELECT id FROM contacts WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]);
    if (!c) return fehler(res, 404, 'nicht_gefunden', 'Kunde nicht gefunden.');
    const { rows } = await pool.query(
      `SELECT id, typ, file_name, file_type, file_size, created_at
         FROM contact_documents WHERE contact_id=$1 AND workspace_id=$2
        ORDER BY created_at DESC, id DESC`,
      [id, req.workspaceId]
    );
    const base = baseUrl(req);
    res.json({ dokumente: rows.map(d => dokumentView(d, base)) });
  } catch (e) { next(e); }
});

// ── PATCH /api/kunden/:id — master data the Engine identified (briefing §5.2 write) ──
// "The engine never overwrites a field already populated in the CRM. It only fills
// empty fields. If a value differs, it writes a note instead of overwriting the
// field. Please enforce this behavior at the endpoint level."
//
// Body: any subset of the §4.3 master-data keys (German), address nested under
// `adresse`; plus an optional `akte_version` precondition — the version the Engine
// last read. Every accepted write bumps akte_version by one, so a stale precondition
// is answered 409 and the Engine re-reads. Only strings are accepted; null and ''
// mean "nothing to add" (the Engine cannot clear a field). Unknown keys are 422.
const PATCH_FIELDS = {                       // body key → contacts column
  firma: 'company', ansprechpartner: 'name', email: 'email', telefon: 'phone',
  rechtsform: 'rechtsform', ust_id: 'ust_id', handelsregisternummer: 'handelsregisternummer', webseite: 'webseite', quelle: 'quelle',
};
const ADDRESS_FIELDS = { strasse: 'strasse', plz: 'plz', ort: 'ort' };
const FIELD_LABELS = {                        // for the conflict note (the users are German)
  firma: 'Firma', ansprechpartner: 'Ansprechpartner', email: 'E-Mail', telefon: 'Telefon', rechtsform: 'Rechtsform', ust_id: 'USt-IdNr.',
  handelsregisternummer: 'Handelsregisternummer', webseite: 'Webseite', quelle: 'Quelle', strasse: 'Straße', plz: 'PLZ', ort: 'Ort',
};
const MAX_LEN = { webseite: 2048 };          // everything else 255
const isEmpty = v => v == null || String(v).trim() === '';

// → { fields: { <feld>: <trimmed string> }, akteVersion: int|null } or { error: { code, nachricht } }
function parseMasterData(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: { code: 'ungueltige_daten', nachricht: 'Der Body muss ein JSON-Objekt sein.' } };
  const fields = {};
  let akteVersion = null;
  const take = (feld, value) => {
    if (value == null) return null;
    if (typeof value !== 'string') return { code: 'ungueltige_daten', nachricht: `${feld} muss ein Text sein.` };
    const v = value.trim();
    if (!v) return null;
    const max = MAX_LEN[feld] || 255;
    if (v.length > max) return { code: 'ungueltige_daten', nachricht: `${feld} darf höchstens ${max} Zeichen lang sein.` };
    fields[feld] = feld === 'email' ? v.toLowerCase() : v;
    return null;
  };
  for (const [key, value] of Object.entries(body)) {
    if (key === 'akte_version') {
      if (!(Number.isInteger(value) && value >= 0)) return { error: { code: 'ungueltige_daten', nachricht: 'akte_version muss eine ganze Zahl ≥ 0 sein.' } };
      akteVersion = value;
    } else if (key === 'adresse') {
      if (value == null) continue;
      if (typeof value !== 'object' || Array.isArray(value)) return { error: { code: 'ungueltige_daten', nachricht: 'adresse muss ein Objekt mit strasse, plz, ort sein.' } };
      for (const [k, v] of Object.entries(value)) {
        if (!(k in ADDRESS_FIELDS)) return { error: { code: 'ungueltige_daten', nachricht: `Unbekanntes Feld adresse.${k}.` } };
        const err = take(k, v); if (err) return { error: err };
      }
    } else if (key in PATCH_FIELDS) {
      const err = take(key, value); if (err) return { error: err };
    } else {
      return { error: { code: 'ungueltige_daten', nachricht: `Unbekanntes oder hier nicht änderbares Feld: ${key}.` } };
    }
  }
  return { fields, akteVersion };
}

function conflictNote(konflikte) {
  const lines = konflikte.map(k => k.grund === 'email_vergeben'
    ? `• ${FIELD_LABELS[k.feld]}: Engine „${k.engine}“ – gehört bereits einem anderen Kontakt`
    : `• ${FIELD_LABELS[k.feld]}: CRM „${k.crm}“ / Engine „${k.engine}“`);
  return ['Upgrads Engine: abweichende Stammdaten erkannt – nicht überschrieben.', ...lines].join('\n');
}

router.patch('/:id', (req, res, next) =>
  runIdempotent(req, res, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return fehler(res, 400, 'ungueltige_id', 'Die Kunden-ID muss eine ganze Zahl sein.');

    const parsed = parseMasterData(req.body);
    if (parsed.error) return fehler(res, 422, parsed.error.code, parsed.error.nachricht);
    if (!Object.keys(parsed.fields).length) return fehler(res, 422, 'keine_daten', 'Es wurden keine Stammdaten übergeben.');

    const { rows: [c] } = await pool.query(`SELECT ${COLUMNS} FROM contacts WHERE id=$1 AND workspace_id=$2`, [id, req.workspaceId]);
    if (!c) return fehler(res, 404, 'nicht_gefunden', 'Kunde nicht gefunden.');
    if (parsed.akteVersion != null && Number(c.akte_version) !== parsed.akteVersion) {
      return fehler(res, 409, 'akte_version_konflikt', `Die Akte wurde zwischenzeitlich geändert (aktuelle akte_version ${Number(c.akte_version) || 0}).`);
    }

    const sets = [], params = [], gesetzt = [], konflikte = [];
    for (const [feld, value] of Object.entries(parsed.fields)) {
      const col     = PATCH_FIELDS[feld] || ADDRESS_FIELDS[feld];
      const current = c[col];
      if (!isEmpty(current)) {
        if (normalize(col, current) !== normalize(col, value)) konflikte.push({ feld, crm: current, engine: value });
        continue;                                                  // equal or different: the CRM's value stands
      }
      if (feld === 'email') {                                      // the CRM keeps one contact per email and workspace
        const { rows: [taken] } = await pool.query('SELECT id FROM contacts WHERE workspace_id=$1 AND email=$2 AND id<>$3', [req.workspaceId, value, id]);
        if (taken) { konflikte.push({ feld, crm: null, engine: value, grund: 'email_vergeben' }); continue; }
      }
      params.push(value);
      sets.push(`${col} = $${params.length}`);
      gesetzt.push(feld);
    }

    let row = c;
    if (sets.length) {
      params.push(id, req.workspaceId);
      const { rows: [updated] } = await pool.query(
        `UPDATE contacts SET ${sets.join(', ')}, akte_version = akte_version + 1, updated_at = NOW()
          WHERE id = $${params.length - 1} AND workspace_id = $${params.length}
          RETURNING ${COLUMNS}`,
        params
      );
      if (!updated) return fehler(res, 404, 'nicht_gefunden', 'Kunde nicht gefunden.');
      row = updated;
    }
    if (konflikte.length) {
      // source 'engine', created_by NULL: shows on the contact like any other note, signed "Upgrads Engine".
      await pool.query(
        `INSERT INTO activities (workspace_id, contact_id, type, content, created_by, source) VALUES ($1,$2,'note',$3,NULL,'engine')`,
        [req.workspaceId, id, activityHtml(conflictNote(konflikte))]
      );
    }
    res.json({ ...kundeView(row), gesetzt, konflikte });
  }).catch(next)
);

// ── Notes (briefing §5.2: GET "sales call notes", POST "engine result logs as a note") ──
const NOTE_COLS = `a.id, a.type, a.content, a.source, a.deal_id, TO_CHAR(a.event_date, 'YYYY-MM-DD') AS event_date, a.event_time, a.created_at`;
const MAX_NOTE_CHARS = 10000;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

// Shared by /notizen and /kommunikation: ?typ=<one of the Engine's words>&seit=<ISO>&limit=1..500.
// `typMap` maps the activities.type values of the listing to the Engine's words.
// → { typeFilter, since, max } or { error: { code, nachricht } }. Nothing invalid reaches the database.
function parseActivityQuery(query, typMap) {
  const { typ, seit, limit } = query;
  let typeFilter = null;
  if (typ !== undefined) {
    typeFilter = Object.keys(typMap).find(k => typMap[k] === typ) || null;
    if (!typeFilter) return { error: { code: 'ungueltige_daten', nachricht: `typ muss ${Object.values(typMap).join(' oder ')} sein.` } };
  }
  let since = null;
  if (seit !== undefined) {
    if (typeof seit !== 'string' || !ISO_INSTANT.test(seit) || Number.isNaN(Date.parse(seit))) return { error: { code: 'ungueltige_daten', nachricht: 'seit muss ein ISO-8601-Datum oder -Zeitpunkt sein.' } };
    since = new Date(seit).toISOString();
  }
  let max = 200;
  if (limit !== undefined) {
    max = Number(limit);
    if (!Number.isInteger(max) || max < 1 || max > 500) return { error: { code: 'ungueltige_daten', nachricht: 'limit muss eine ganze Zahl zwischen 1 und 500 sein.' } };
  }
  return { typeFilter, since, max };
}

// The customer's activities of the given types, newest first, filtered per parseActivityQuery().
async function listActivities(req, id, types, { typeFilter, since, max }) {
  const params = [id, req.workspaceId];
  const where  = ['a.contact_id = $1', 'a.workspace_id = $2', `a.type IN (${types.map(t => `'${t}'`).join(',')})`];
  if (typeFilter) { params.push(typeFilter); where.push(`a.type = $${params.length}`); }
  if (since)      { params.push(since);      where.push(`a.created_at >= $${params.length}`); }
  params.push(max);
  const { rows } = await pool.query(
    `SELECT ${NOTE_COLS}, u.name AS logged_by_name
       FROM activities a LEFT JOIN users u ON u.id = a.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

// GET /api/kunden/:id/notizen?typ=notiz|anruf&seit=<ISO date or instant>&limit=1..500
// Notes and call logs of the customer, newest first. E-mails are /kommunikation.
router.get('/:id/notizen', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fehler(res, 400, 'ungueltige_id', 'Die Kunden-ID muss eine ganze Zahl sein.');
    const q = parseActivityQuery(req.query, NOTE_TYPES);
    if (q.error) return fehler(res, 422, q.error.code, q.error.nachricht);
    const { rows: [c] } = await pool.query('SELECT id FROM contacts WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]);
    if (!c) return fehler(res, 404, 'nicht_gefunden', 'Kunde nicht gefunden.');
    const rows = await listActivities(req, id, Object.keys(NOTE_TYPES), q);
    res.json({ notizen: rows.map(notizView) });
  } catch (e) { next(e); }
});

// GET /api/kunden/:id/kommunikation?typ=email|whatsapp&seit=…&limit=… (briefing §5.2
// "email correspondence"). The CRM has no mailbox: these are the e-mails and WhatsApp
// messages a team member logged by hand, so betreff / richtung / absender are null and
// erfasst_von names who logged it. Stated in the contract doc.
const COMMUNICATION_TYP = Object.fromEntries(COMMUNICATION_TYPES.map(t => [t, t]));   // the Engine's words are the CRM's
router.get('/:id/kommunikation', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return fehler(res, 400, 'ungueltige_id', 'Die Kunden-ID muss eine ganze Zahl sein.');
    const q = parseActivityQuery(req.query, COMMUNICATION_TYP);
    if (q.error) return fehler(res, 422, q.error.code, q.error.nachricht);
    const { rows: [c] } = await pool.query('SELECT id FROM contacts WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]);
    if (!c) return fehler(res, 404, 'nicht_gefunden', 'Kunde nicht gefunden.');
    const rows = await listActivities(req, id, COMMUNICATION_TYPES, q);
    res.json({
      kommunikation: rows.map(kommunikationView),
      hinweis: 'Das CRM hat kein Postfach: Einträge sind manuell erfasste E-Mails/WhatsApp-Nachrichten. betreff, richtung und absender sind nicht erfasst (null); erfasst_von ist die erfassende Person.',
    });
  } catch (e) { next(e); }
});

// POST /api/kunden/:id/notizen { inhalt, vertrag_id? } — the Engine's result log as a
// note on the customer (source 'engine', author "Upgrads Engine" in the CRM). Plain
// text in; stored the way the browser stores notes (escaped, <br>). Idempotent.
router.post('/:id/notizen', (req, res, next) =>
  runIdempotent(req, res, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return fehler(res, 400, 'ungueltige_id', 'Die Kunden-ID muss eine ganze Zahl sein.');
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const inhalt = typeof body.inhalt === 'string' ? body.inhalt.trim() : '';
    if (!inhalt) return fehler(res, 422, 'ungueltige_daten', 'inhalt (Text) ist erforderlich.');
    if (inhalt.length > MAX_NOTE_CHARS) return fehler(res, 422, 'ungueltige_daten', `inhalt darf höchstens ${MAX_NOTE_CHARS} Zeichen lang sein.`);
    let dealId = null;
    if (body.vertrag_id != null) {
      if (!(Number.isInteger(body.vertrag_id) && body.vertrag_id > 0)) return fehler(res, 422, 'ungueltige_daten', 'vertrag_id muss eine ganze Zahl sein.');
      dealId = body.vertrag_id;
    }
    for (const k of Object.keys(body)) if (k !== 'inhalt' && k !== 'vertrag_id') return fehler(res, 422, 'ungueltige_daten', `Unbekanntes Feld: ${k}.`);

    const { rows: [c] } = await pool.query('SELECT id FROM contacts WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]);
    if (!c) return fehler(res, 404, 'nicht_gefunden', 'Kunde nicht gefunden.');
    if (dealId != null) {
      const { rows: [d] } = await pool.query('SELECT id FROM deals WHERE id=$1 AND workspace_id=$2 AND contact_id=$3', [dealId, req.workspaceId, id]);
      if (!d) return fehler(res, 422, 'ungueltige_daten', 'vertrag_id gehört nicht zu diesem Kunden.');
    }
    const { rows: [a] } = await pool.query(
      `INSERT INTO activities (workspace_id, contact_id, type, content, created_by, source, deal_id)
       VALUES ($1,$2,'note',$3,NULL,'engine',$4)
       RETURNING id, type, content, source, deal_id, TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date, event_time, created_at`,
      [req.workspaceId, id, activityHtml(inhalt), dealId]
    );
    res.status(201).json(notizView(a));
  }).catch(next)
);

// Anything else under /api/kunden is a JSON 404, not the SPA catch-all in server.js.
router.use((req, res) => fehler(res, 404, 'nicht_gefunden', 'Unbekannter Endpunkt.'));

// Router-level error handler: the Engine must get the fehler shape, never the
// global handler's { error } body, and never an internal message.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  console.error('engine-api:', err);
  fehler(res, 500, 'serverfehler', 'Interner Fehler. Bitte später erneut versuchen.');
});

module.exports = router;
module.exports.ONBOARDING_STATUSES = ONBOARDING_STATUSES;
module.exports.kundeView = kundeView;
module.exports.parseMasterData = parseMasterData;
module.exports.conflictNote = conflictNote;
