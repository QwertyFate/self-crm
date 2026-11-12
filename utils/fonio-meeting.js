/* ═══════════════════════════════════════════════════════════════════════════
   FONIO MEETING — a meeting fonio's assistant agreed with the lead in a call,
   booked at the workspace's booking service (FONIO_CHANGES Part 28).

   fonio's result after a call (utils/fonio-result.js) can say that a meeting
   was agreed, and when: meeting_booked, meeting_date, meeting_time, filled by
   variables of the workspace's own in fonio. bookMeeting() then books that
   time for the call's contact at Cal.com or Calendly — whichever is connected,
   on the event type chosen on its card — exactly as a person booking from the
   deal would: the contact is the guest and gets the service's invitation, the
   meeting becomes a 'meeting' entry on the contact and the deal. Without a
   booking service connected nothing is booked.

   What can stand in the way is answered, never thrown: { status: 'failed',
   reason } with reason no_time (the date or time could not be read), past,
   no_contact, no_email (the services cannot book without one; fonio's
   meeting_email — the address confirmed in the call — comes first, the
   contact's own second), no_event_type, refused
   (the service said no — the time is taken, most often; `detail` has its
   words). noteLine() says the outcome in the call's note, in German like the
   note itself.

   The agreed time is read as the wall clock of the connected account's zone.
   The entry is written here at once; the service's webhook then lands on the
   same row (the booking's id is unique per workspace), so nobody is told twice.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const calcom   = require('./calcom');
const calendly = require('./calendly');

const SERVICE_NAMES = { calcom: 'Cal.com', calendly: 'Calendly' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function connection(pool, wid) {
  const { rows: [cal] } = await pool.query('SELECT api_key_sealed, event_type_id, event_types, cal_timezone, connected_by FROM workspace_calcom WHERE workspace_id = $1', [wid]);
  if (cal) return { service: 'calcom', row: cal, zone: cal.cal_timezone || calcom.FALLBACK_ZONE };
  const { rows: [cly] } = await pool.query('SELECT token_sealed, event_type_uri, event_types, cly_timezone, connected_by FROM workspace_calendly WHERE workspace_id = $1', [wid]);
  return cly ? { service: 'calendly', row: cly, zone: cly.cly_timezone || calcom.FALLBACK_ZONE } : null;
}

async function bookAtCalcom(pool, wid, c, contact, dealId, start) {
  const types = Array.isArray(c.row.event_types) ? c.row.event_types : [];
  const type = types.find(t => t.id === c.row.event_type_id);
  if (!type) return { status: 'failed', reason: 'no_event_type' };
  const metadata = { upgrads_contact_id: String(contact.id) };
  if (dealId) metadata.upgrads_deal_id = String(dealId);
  const booking = await calcom.createBooking(calcom.openKey(c.row.api_key_sealed), { eventTypeId: type.id, start, attendee: { name: contact.name, email: contact.email, timeZone: c.zone }, metadata });
  const a = calcom.bookingToActivity({ uid: booking.uid, title: booking.title || type.title, start: booking.start || start, organizer: { timeZone: c.zone }, attendee: { name: contact.name }, meetingUrl: booking.meetingUrl }, c.zone);
  const { rows: [row] } = await pool.query(
    `INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calcom_uid, calcom_event_type_id)
     VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calcom',$9,$10)
     ON CONFLICT (workspace_id, calcom_uid) WHERE calcom_uid IS NOT NULL
     DO UPDATE SET deal_id=COALESCE(EXCLUDED.deal_id, activities.deal_id), calcom_event_type_id=EXCLUDED.calcom_event_type_id
     RETURNING id, (xmax = 0) AS inserted`,
    [wid, contact.id, dealId, a.content, c.row.connected_by || null, a.event_date, a.event_time, a.event_tz, booking.uid, type.id]
  );
  return { status: 'booked', activity_id: row.id, inserted: row.inserted === true, title: a.content, url: booking.meetingUrl || null, location: booking.location || null };
}

async function bookAtCalendly(pool, wid, c, contact, dealId, start) {
  const types = Array.isArray(c.row.event_types) ? c.row.event_types : [];
  const type = types.find(t => t.uri === c.row.event_type_uri);
  if (!type) return { status: 'failed', reason: 'no_event_type' };
  const b = await calendly.createInvitee(calcom.openKey(c.row.token_sealed), {
    eventType: type.uri, start, name: contact.name, email: contact.email, timezone: c.zone, location: calendly.bookingLocation(type, contact.phone),
  });
  const a = calendly.inviteeToActivity({ uid: b.uri, eventUri: b.eventUri, title: type.name, start, attendee: { name: contact.name }, meetingUrl: null }, c.zone);
  const { rows: [row] } = await pool.query(
    `INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calendly_uri, calendly_event_uri)
     VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calendly',$9,$10)
     ON CONFLICT (workspace_id, calendly_uri) WHERE calendly_uri IS NOT NULL
     DO UPDATE SET deal_id=COALESCE(EXCLUDED.deal_id, activities.deal_id), calendly_event_uri=COALESCE(EXCLUDED.calendly_event_uri, activities.calendly_event_uri)
     RETURNING id, (xmax = 0) AS inserted`,
    [wid, contact.id, dealId, a.content, c.row.connected_by || null, a.event_date, a.event_time, a.event_tz, b.uri, b.eventUri]
  );
  return { status: 'booked', activity_id: row.id, inserted: row.inserted === true, title: a.content, url: null, location: null };
}

// Book the meeting the call agreed. null when the result names none; { status: 'not_connected' } without a booking
// service; else { status: 'booked', service, start, activity_id, … } or { status: 'failed', service, reason, detail }.
// Every answer carries the agreed date and time as read (date, time; null when unreadable). Never throws.
async function bookMeeting(pool, { wid, contactId, dealId = null, meeting, now = Date.now() }) {
  if (!meeting) return null;
  const said = { date: meeting.date || null, time: meeting.time || null, said: meeting.said || null };
  try {
    const c = await connection(pool, wid);
    if (!c) return { status: 'not_connected', ...said };
    const fail = (reason, detail = null) => ({ status: 'failed', service: c.service, reason, detail, ...said });
    if (!meeting.date || !meeting.time) return fail('no_time');
    const start = calcom.utcFromWallClock(meeting.date, meeting.time, c.zone);
    if (!start) return fail('no_time');
    if (Date.parse(start) <= new Date(now).getTime()) return fail('past');
    const { rows: [found] } = contactId ? await pool.query('SELECT id, name, email, phone FROM contacts WHERE id = $1 AND workspace_id = $2', [contactId, wid]) : { rows: [] };
    if (!found) return fail('no_contact');
    // the address confirmed or corrected in the call (meeting_email) is the newest one; else the contact's own
    const email = [meeting.email, found.email].map(e => String(e || '').trim().toLowerCase()).find(e => EMAIL.test(e));
    if (!email) return fail('no_email');
    const contact = { id: found.id, name: found.name || email, email, phone: found.phone || null };
    let out;
    try { out = c.service === 'calcom' ? await bookAtCalcom(pool, wid, c, contact, dealId, start) : await bookAtCalendly(pool, wid, c, contact, dealId, start); }
    catch (err) {
      if (err instanceof calcom.CalError || err instanceof calendly.CalendlyError) return fail('refused', String(err.message || '').slice(0, 300));
      throw err;
    }
    return { ...out, service: c.service, start, zone: c.zone, ...said, contact_id: contact.id, deal_id: dealId };
  } catch (err) {
    return { status: 'failed', service: null, reason: 'error', detail: String(err?.message || err).slice(0, 200), ...said };
  }
}

const whenText = m => (m.date && m.time ? `${m.date.slice(8, 10)}.${m.date.slice(5, 7)}.${m.date.slice(0, 4)}, ${m.time}` : (m.said || 'ohne lesbare Zeit'));
const WHY = {
  no_time: 'Datum oder Uhrzeit waren nicht lesbar', past: 'die Zeit liegt in der Vergangenheit', no_contact: 'der Anruf gehört zu keinem Kontakt',
  no_email: 'der Kontakt hat keine E-Mail-Adresse', no_event_type: 'es ist keine Terminart gewählt', error: 'ein Fehler im CRM',
};
// The outcome as a line for the call's note.
function noteLine(m) {
  if (!m) return '';
  if (m.status === 'booked') return `Termin gebucht: ${whenText(m)} (${SERVICE_NAMES[m.service]})`;
  if (m.status === 'not_connected') return `Im Gespräch vereinbarter Termin: ${whenText(m)}`;
  const why = m.reason === 'refused' ? `${SERVICE_NAMES[m.service] || 'der Buchungsdienst'} hat abgelehnt: ${m.detail || 'ohne Angabe'}` : (WHY[m.reason] || WHY.error);
  return `Termin im Gespräch vereinbart (${whenText(m)}), aber nicht gebucht: ${why}`;
}

// Who answers for the call's deal, else for its contact: the one to tell when a booking failed.
async function assigneeOf(pool, wid, dealId, contactId) {
  if (dealId) {
    const { rows: [d] } = await pool.query('SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2', [dealId, wid]);
    if (d?.assigned_to) return d.assigned_to;
  }
  if (contactId) {
    const { rows: [c] } = await pool.query('SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2', [contactId, wid]);
    if (c?.assigned_to) return c.assigned_to;
  }
  return null;
}

module.exports = { bookMeeting, noteLine, assigneeOf, whenText, SERVICE_NAMES };
