/* ═══════════════════════════════════════════════════════════════════════════
   FACEBOOK LEADS — what becomes of a lead that Facebook announced
   (FACEBOOK_CHANGES Part 3, 2026-11-24; routes/facebook-receive.js is where
   the announcement arrives, utils/facebook.js is Facebook's side).

   Facebook says only "a lead arrived": which lead (leadgen_id), on which Page.
   take() makes a contact of it:
     1. THE LEAD IS CLAIMED in facebook_leads, by Facebook's own id. Facebook
        sends an announcement again when it got no answer, and may send it
        twice anyway: a lead that was already taken is not taken again.
     2. THE PAGE must be one that was given to a workspace (facebook_pages),
        with a lead webhook that still exists and is switched on — or is
        listening for its test delivery.
     3. THE ANSWERS are fetched from Facebook with the Page's own token.
     4. THEY ARE HANDED TO THAT LEAD WEBHOOK exactly as a delivery to its
        public address would be (routes/integrations.js takeDelivery): its
        field mapping, its pipeline, stage and assignee, its log — and while
        it is listening for a test delivery, the lead is kept as its sample.
        What it is handed is the lead as Facebook has it, plus the Page:
          { id, created_time, field_data: [{ name, values }], form_id,
            ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
            platform, is_organic, page_id, page_name }
        so the mapping reads an answer as  field_data[name=email].values

   WHAT take() ANSWERS  { status, reason, retry }
     done                     a contact (and a deal, where the webhook makes one)
     test                     kept as the lead webhook's sample
     skipped  no_page         the Page is given to no workspace
              no_webhook      its lead webhook was deleted
              off             its lead webhook is switched off
              rejected        Facebook does not hand the lead out (its words
                              are kept in `detail`)
              unmapped        neither a name nor an email could be read
     failed   unreachable     Facebook did not answer
              gone            the Page's token is no longer accepted
              facebook        Facebook says: later
              error           this server could not (the database)
     known                    taken before: nothing is done
     busy                     another request is taking it right now
   retry is true for failed and busy: the receiver then does not confirm the
   announcement, and Facebook sends it again (for up to 36 hours). A lead that
   stayed "working" for two minutes was left behind by a request that died,
   and is taken by the next one.

   Nothing here opens the database module: the pool and the lead webhook's
   delivery are handed in.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const facebook = require('./facebook');
const { openKey } = require('./calcom');   // a Page's token is sealed like every key kept here

// The claim: a new lead, or one that failed before, or one left behind. No row comes back for any other.
const CLAIM = `INSERT INTO facebook_leads (leadgen_id, page_id, form_id) VALUES ($1, $2, $3)
   ON CONFLICT (leadgen_id) DO UPDATE SET status = 'working', claimed_at = NOW(), updated_at = NOW(), tries = facebook_leads.tries + 1
     WHERE facebook_leads.status = 'failed' OR (facebook_leads.status = 'working' AND facebook_leads.claimed_at < NOW() - INTERVAL '2 minutes')
   RETURNING leadgen_id`;
const FINISH = `UPDATE facebook_leads SET status = $2, reason = $3, detail = $4, workspace_id = $5, webhook_id = $6, contact_id = $7, deal_id = $8, updated_at = NOW()
   WHERE leadgen_id = $1`;
const MAX_DETAIL = 300;

// One announced lead: ev = { leadgenId, pageId, formId } (utils/facebook.js leadEvents). deliver(webhookRow, payload)
// is the lead webhook's own delivery. It throws only when the claim itself cannot be asked of the database.
async function take(pool, ev, { deliver, fetchLead = facebook.lead } = {}) {
  const { rows: [mine] } = await pool.query(CLAIM, [ev.leadgenId, ev.pageId, ev.formId || null]);
  if (!mine) {
    const { rows: [row] } = await pool.query('SELECT status FROM facebook_leads WHERE leadgen_id = $1', [ev.leadgenId]);
    return row && row.status === 'working' ? { status: 'busy', reason: null, retry: true } : { status: 'known', reason: null, retry: false };
  }
  const where = { workspaceId: null, webhookId: null };
  const end = async (status, reason = null, detail = null, made = {}) => {
    await pool.query(FINISH, [ev.leadgenId, status, reason, detail ? String(detail).slice(0, MAX_DETAIL) : null, where.workspaceId, where.webhookId, made.contactId || null, made.dealId || null]);
    return { status, reason, retry: status === 'failed' };
  };
  try {
    const { rows: [page] } = await pool.query('SELECT page_id, page_name, workspace_id, webhook_id, token FROM facebook_pages WHERE page_id = $1', [ev.pageId]);
    if (!page) return await end('skipped', 'no_page');
    where.workspaceId = page.workspace_id;
    const { rows: [wh] } = page.webhook_id ? await pool.query('SELECT * FROM workspace_webhook WHERE id = $1 AND workspace_id = $2', [page.webhook_id, page.workspace_id]) : { rows: [] };
    if (!wh) return await end('skipped', 'no_webhook');
    where.webhookId = wh.id;
    // switched off: only a webhook that is listening for its test delivery still takes a lead
    if (wh.active === false && !(wh.test_until && new Date(wh.test_until).getTime() > Date.now())) return await end('skipped', 'off');

    let lead;
    try { lead = await fetchLead(ev.leadgenId, openKey(page.token)); }
    catch (err) {
      if (!(err instanceof facebook.FacebookError)) return await end('failed', 'gone', 'The Page\'s token cannot be opened on this server.');
      if (err.code === 'unreachable' || err.code === 'gone') return await end('failed', err.code, err.message);
      return err.transient ? await end('failed', 'facebook', err.message) : await end('skipped', 'rejected', err.message);
    }

    const out = await deliver(wh, { ...lead, page_id: page.page_id, page_name: page.page_name });
    if (out.kind === 'lead') return await end('done', null, null, out);
    if (out.kind === 'test') return await end('test');
    return await end('skipped', out.kind === 'off' ? 'off' : 'unmapped');
  } catch (err) {
    // the database, or something nobody thought of: the lead stays to be sent again
    try { return await end('failed', 'error', (err && err.message) || 'error'); }
    catch { return { status: 'failed', reason: 'error', retry: true }; }
  }
}

module.exports = { CLAIM, FINISH, MAX_DETAIL, take };
