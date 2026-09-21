// The seven onboarding statuses, in process order. Single source for the
// engine API (routes/engine-api.js), the manual change (routes/contacts.js)
// and the tests. Must match the CHECK constraint on contacts.onboarding_status
// in db.js and ONBOARDING_STATUS_META in public/js/contacts.js.
const ONBOARDING_STATUSES = [
  'kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht',
  'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen',
];

module.exports = { ONBOARDING_STATUSES };
