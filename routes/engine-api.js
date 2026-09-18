/**
 * Engine API — the endpoints the UPGRADS Onboarding Engine calls.
 *
 * Mounted at /api/kunden. Every request authenticates with an API key
 * (middleware/engine-auth.js), which sets req.workspaceId; every query is
 * scoped to that workspace. Errors use { fehler: { code, nachricht } }.
 *
 * This file deliberately does NOT require utils/engine-webhook.js: a status
 * change made *by* the engine must not be echoed back *to* the engine, or the
 * two systems would loop. Outbound events are emitted only by CRM-user
 * actions, never from here.
 */
const express           = require('express');
const router            = express.Router();
const { pool }          = require('../db');
const engineAuth        = require('../middleware/engine-auth');
const { runIdempotent } = require('../utils/idempotency');

router.use(engineAuth);

const ONBOARDING_STATUSES = [
  'kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht',
  'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen',
];
const MAX_DRIVE_ID = 255;

const fehler = (res, status, code, nachricht) => res.status(status).json({ fehler: { code, nachricht } });

const COLUMNS = `id, workspace_id, name, email, phone, company, contact_type,
  onboarding_status, drive_ordner_id, akte_version,
  rechtsform, ust_id, handelsregisternummer, webseite, quelle, strasse, plz, ort,
  created_at, updated_at`;

// The engine's view of a contact: German keys, address grouped, nulls never undefined.
function kundeView(c) {
  return {
    kunde_id:              c.id,
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
    onboarding_status:     c.onboarding_status ?? 'kein_onboarding',
    drive_ordner_id:       c.drive_ordner_id ?? null,
    akte_version:          c.akte_version ?? 0,
    erstellt_am:           c.created_at ?? null,
    aktualisiert_am:       c.updated_at ?? null,
  };
}

const parseId = raw => (/^\d+$/.test(String(raw)) ? Number(raw) : null);

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

// PATCH /api/kunden/:id/status — onboarding status (+ optional Drive folder).
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

    // drive_ordner_id is touched only when the key is present; present with null clears it.
    const hasDrive = Object.prototype.hasOwnProperty.call(body, 'drive_ordner_id');
    const drive    = body.drive_ordner_id;
    if (hasDrive && drive !== null && (typeof drive !== 'string' || drive.length > MAX_DRIVE_ID)) {
      return fehler(res, 422, 'ungueltige_daten', `drive_ordner_id muss ein Text mit höchstens ${MAX_DRIVE_ID} Zeichen oder null sein.`);
    }

    const sets   = ['onboarding_status = $1', 'updated_at = NOW()'];
    const params = [status];
    if (hasDrive) { params.push(drive); sets.push(`drive_ordner_id = $${params.length}`); }
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

module.exports = router;
module.exports.ONBOARDING_STATUSES = ONBOARDING_STATUSES;
module.exports.kundeView = kundeView;
