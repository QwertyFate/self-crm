/* ═══════════════════════════════════════════════════════════════════════════
   /api/admin/facebook — the platform's ONE Facebook connection, for lead ads
   (FACEBOOK_CHANGES Part 1, 2026-11-23; utils/facebook.js has Facebook's side
   and why there is one connection for the whole platform; the "Facebook" tab
   of public/admin.html is its page).

   Platform console only: every route is behind requireAdmin (the console's
   session, or the secret in the request — middleware/admin-auth.js). Nothing
   here belongs to a workspace.

     GET    /facebook            { configured, redirect_uri, version, scopes,
                                   connection } — connection: null, or who is
                                   connected ({ user_id, name, connected_at,
                                   expires_at, scopes, missing }); never a token
     POST   /facebook/connect    { url }: Facebook's sign-in page, to go to
     GET    /facebook/callback   where Facebook sends the person back. Answers
                                 with a redirect to the console:
                                 /adminconsole?facebook=connected | denied |
                                 state | failed | unreachable | login
     GET    /facebook/pages      { pages: [{ id, name, can_advertise, tasks,
                                 assigned, installed, installed_note, leads }],
                                 lost } — the Pages asked of Facebook now,
                                 never a Page's token; assigned: null, or the
                                 workspace and lead webhook the Page was given
                                 to; lost: Pages that were given but are no
                                 longer among the account's Pages. Part 4, per
                                 Page: installed — is the app on the Page at
                                 Facebook for its leads (true / false; null
                                 when the Page is not given or Facebook could
                                 not be asked, installed_note then says why);
                                 leads — null while none arrived, else { total,
                                 contacts, waiting, last: { status, reason,
                                 detail, at } } from facebook_leads
     GET    /facebook/targets    { workspaces: [{ id, name, webhooks: [{ id,
                                 name, active }] }] } — what a Page can be
                                 given to
     PUT    /facebook/pages/:id  { workspace_id, webhook_id }: the Page is
                                 given to that workspace; its leads will go to
                                 that lead webhook of it (Part 2). The app is
                                 installed on the Page at Facebook first
                                 (Part 3): a Page Facebook refuses is not given
     DELETE /facebook/pages/:id  the Page is taken back, and the app taken off
                                 it at Facebook: { success, unsubscribed }
     DELETE /facebook            the connection is forgotten here, and every
                                 Page is taken back with it
     GET    /facebook/receiver   { callback_url, verify_token, registered,
                                 elsewhere, error }: where Facebook is to tell
                                 this server of a new lead, and whether the app
                                 is registered for it (Part 3)
     POST   /facebook/receiver   the app is registered for that address

   WHERE IT IS KEPT  platform_settings, key "facebook": { user_id, name,
   token (sealed, utils/calcom.js sealKey), expires_at, scopes, connected_at }.
   One row for the platform; the workspace export leaves platform_settings out.

   A PAGE GIVEN TO A WORKSPACE (Part 2)  facebook_pages: page_id, page_name,
   workspace_id, webhook_id, token. One Page belongs to one workspace; a
   workspace can have several Pages. The lead webhook is one of the
   workspace's own (workspace_webhook) — its field mapping is what will turn a
   lead's answers into a contact. token is the PAGE's own token, as Facebook
   hands it out with the account's Pages, sealed like the account's. A Page
   can be given only while the connected account may advertise on it: that is
   the right reading its leads needs. Nothing is asked of Facebook about a
   Page here beyond the account's list of Pages and, since Part 3, installing
   the app on it.

   RECEIVING LEADS (Part 3; utils/facebook.js says what Facebook wants,
   routes/facebook-receive.js is the address, utils/facebook-leads.js what
   becomes of a lead). Two things have to be in place:
     the APP knows this server's address — one address for the whole app.
       GET /facebook/receiver asks Facebook (with the app's own token) where
       the app is registered for Pages: `registered` is true only for exactly
       this server's address, active, with the field leadgen; `elsewhere` names
       another address the app is registered for; when Facebook cannot be
       asked, registered is null and `error` says why. It needs no connected
       account. POST registers this address, replacing an earlier one.
       verify_token is the word Facebook names when it asks the address
       whether it is the right one: shown, so that the address can also be
       entered by hand in Meta's dashboard. It is no token of Facebook's.
     each PAGE has the app installed for its leads. That is done when the Page
       is given (before anything is written: refused by Facebook, the Page is
       not given) and undone when it is taken back or the connection is
       forgotten — best effort then: what is taken back here is taken back,
       whatever Facebook says; `unsubscribed` tells whether Facebook confirmed.

   THE CALLBACK is a page the browser is sent to, not a request of the console:
   it never answers with JSON. It counts only for the console session that
   started the sign-in (the `state` kept in that session), so it needs the
   session — the secret in a header cannot stand in for it.

   REFUSALS  { error, code }: not_configured (503), not_connected (409),
   gone (409: Facebook no longer accepts the token — connect again),
   unreachable (502), rejected (502, with Facebook's words); giving a Page:
   page (404: not one of the account's Pages), no_advertise (409), target
   (400: no such workspace, or the lead webhook is not that workspace's),
   subscribe (502: Facebook did not install the app on the Page, with its
   words); registering: receiver (502, with Facebook's words).
   ═══════════════════════════════════════════════════════════════════════════ */

const express      = require('express');
const router       = express.Router();
const { pool }     = require('../db');
const requireAdmin = require('../middleware/admin-auth');
const baseUrl      = require('../utils/base-url');
const facebook     = require('../utils/facebook');
const { sealKey, openKey } = require('../utils/calcom');

const KEY = 'facebook';
const ERRORS = {
  not_configured: [503, 'Facebook is not set up on this server: META_APP_ID and META_APP_SECRET are missing.'],
  not_connected:  [409, 'No Facebook account is connected.'],
  gone:           [409, 'Facebook no longer accepts the connection. Connect again.'],
  unreachable:    [502, 'Facebook could not be reached.'],
  rejected:       [502, 'Facebook refused the request.'],
  page:           [404, 'That is not one of the Pages of the connected Facebook account.'],
  no_advertise:   [409, 'The connected Facebook account may not advertise on this Page, so its leads cannot be read.'],
  target:         [400, 'Choose a workspace and one of its lead webhooks.'],
  subscribe:      [502, 'Facebook did not install the app on this Page, so its leads would not arrive.'],
  receiver:       [502, 'Facebook did not accept the receiving address.'],
};
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2147483647 ? v : null);
const pageIdOf = v => (typeof v === 'string' && /^\d{1,30}$/.test(v) ? v : null);
const refuse = (res, code, detail) => res.status(ERRORS[code][0]).json({ error: detail ? `${ERRORS[code][1]} ${detail}` : ERRORS[code][1], code });
const redirectUri = req => `${baseUrl(req)}/api/admin/facebook/callback`;
const receiveUrl = req => `${baseUrl(req)}/api/integrations/facebook/receive`;
const back = (res, outcome) => res.redirect(`/adminconsole?facebook=${outcome}`);
const isFacebooks = err => !!err && err.name === 'FacebookError';

async function readConnection() {
  const { rows } = await pool.query('SELECT value FROM platform_settings WHERE key = $1', [KEY]);
  const v = rows[0] && rows[0].value;
  return v && typeof v === 'object' && typeof v.token === 'string' && v.token ? v : null;
}
// What the console is told about the connection: who, since when, until when, and which of the permissions that
// are asked for the person did not give. Never the token.
function view(v, wanted) {
  if (!v) return null;
  const scopes = Array.isArray(v.scopes) ? v.scopes.filter(s => typeof s === 'string') : [];
  return { user_id: String(v.user_id || ''), name: String(v.name || ''), connected_at: v.connected_at || null, expires_at: v.expires_at || null, scopes, missing: wanted.filter(s => !scopes.includes(s)) };
}

router.get('/facebook', requireAdmin, async (req, res, next) => {
  try {
    const c = facebook.config();
    res.json({ configured: !!c, redirect_uri: redirectUri(req), version: c ? c.version : facebook.DEFAULT_VERSION, scopes: c ? c.scopes : facebook.SCOPES,
      connection: view(await readConnection(), c ? c.scopes : facebook.SCOPES) });
  } catch (err) { next(err); }
});

// The sign-in begins: a word for this one sign-in is kept in the console's session, and the console goes to Facebook.
router.post('/facebook/connect', requireAdmin, (req, res) => {
  if (!facebook.isConfigured()) return refuse(res, 'not_configured');
  if (!req.session) return res.status(400).json({ error: 'Connecting needs the console session: log in to the console first.', code: 'session' });
  const state = facebook.newState();
  req.session.facebookState = state;
  res.json({ url: facebook.authUrl({ redirectUri: redirectUri(req), state: state.value }) });
});

// Facebook sends the person back here. Whatever happens — also something nobody thought of — the browser ends in
// the console, which says what happened: the whole of it stands inside one try.
router.get('/facebook/callback', async (req, res) => {
  try {
    if (!req.session || !req.session.isAdmin) return back(res, 'login');
    const kept = req.session.facebookState;
    delete req.session.facebookState;   // a word counts once
    if (!facebook.stateMatches(kept, req.query.state)) return back(res, 'state');
    if (req.query.error || typeof req.query.code !== 'string' || !req.query.code) return back(res, req.query.error ? 'denied' : 'failed');
    if (!facebook.isConfigured()) return back(res, 'failed');
    const { token, expiresAt } = await facebook.exchangeCode(req.query.code, redirectUri(req));
    const [who, scopes] = [await facebook.me(token), await facebook.granted(token)];
    const value = { user_id: who.id, name: who.name, token: sealKey(token), expires_at: expiresAt ? expiresAt.toISOString() : null, scopes, connected_at: new Date().toISOString() };
    await pool.query('INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()', [KEY, JSON.stringify(value)]);
    back(res, 'connected');
  } catch (err) {
    // Facebook's own words, or this server's — never the code or a token (utils/facebook.js puts neither into an error)
    console.error('facebook: connecting failed:', err && err.name === 'FacebookError' ? `${err.code}: ${err.message}` : (err && err.message) || err);
    back(res, err && err.code === 'unreachable' ? 'unreachable' : 'failed');
  }
});

// The connected account's Pages as Facebook has them now: { list } — or { code, detail } for the refusal to answer
// with. Each Page comes with its own token, which stays on the server.
async function accountPages() {
  if (!facebook.isConfigured()) return { code: 'not_configured' };
  const v = await readConnection();
  if (!v) return { code: 'not_connected' };
  try { return { list: await facebook.pages(openKey(v.token)) }; }
  catch (err) {
    if (err && err.name === 'FacebookError') return { code: err.code, detail: err.code === 'rejected' ? err.message : undefined };
    return { code: 'gone' };   // a token that cannot be opened with this server's secret is no connection
  }
}
// The Pages that were given to workspaces, each with the names of where it went (the webhook's is null once that
// webhook was deleted).
async function givenPages() {
  const { rows } = await pool.query(
    `SELECT p.page_id, p.page_name, p.workspace_id, w.name AS workspace_name, p.webhook_id, h.name AS webhook_name
       FROM facebook_pages p JOIN workspaces w ON w.id = p.workspace_id LEFT JOIN workspace_webhook h ON h.id = p.webhook_id
      ORDER BY lower(p.page_name), p.page_id`
  );
  return rows;
}
const assignedOf = g => ({ workspace_id: g.workspace_id, workspace_name: g.workspace_name, webhook_id: g.webhook_id, webhook_name: g.webhook_name });

// Part 4 — what became of each Page's leads (facebook_leads, written by utils/facebook-leads.js): how many arrived,
// how many are contacts, how many Facebook is asked to send again, and the last one. A Map by Page id.
async function leadsByPage() {
  const { rows: counts } = await pool.query(
    `SELECT page_id, COUNT(*)::int AS total, (COUNT(*) FILTER (WHERE status = 'done'))::int AS contacts, (COUNT(*) FILTER (WHERE status = 'failed'))::int AS waiting
       FROM facebook_leads GROUP BY page_id`
  );
  const { rows: last } = await pool.query('SELECT DISTINCT ON (page_id) page_id, status, reason, detail, created_at FROM facebook_leads ORDER BY page_id, created_at DESC, leadgen_id DESC');
  const lastOf = new Map(last.map(l => [l.page_id, { status: l.status, reason: l.reason || null, detail: l.detail || null, at: l.created_at }]));
  return new Map(counts.map(c => [c.page_id, { total: c.total, contacts: c.contacts, waiting: c.waiting, last: lastOf.get(c.page_id) || null }]));
}
// Part 4 — is the app on a given Page at Facebook, for its leads? Asked with the Page's token as it is kept — the one
// its leads are fetched with, so a token Facebook no longer takes shows here too. Never an error: { installed, note }.
const NOTES = { token: 'The Page\'s token cannot be opened on this server. Save the Page again.', gone: 'Facebook no longer accepts the Page\'s token. Save the Page again.' };
async function installedOn(pageId, sealed) {
  let token;
  try { token = openKey(sealed); } catch { return { installed: null, note: NOTES.token }; }
  try { return { installed: await facebook.pageInstalled(pageId, token), note: null }; }
  catch (err) {
    if (!isFacebooks(err)) throw err;
    return { installed: null, note: err.code === 'gone' ? NOTES.gone : err.code === 'unreachable' ? ERRORS.unreachable[1] : err.message };
  }
}

// The Pages of the connected person, asked of Facebook now, each with where it was given to — and the Pages that
// were given but are no longer among them (the account lost the Page: its leads cannot be read any more).
router.get('/facebook/pages', requireAdmin, async (req, res, next) => {
  try {
    const got = await accountPages();
    if (got.code) return refuse(res, got.code, got.detail);
    const given = await givenPages(), byPage = new Map(given.map(g => [g.page_id, g])), leads = await leadsByPage();
    // every given Page that is still the account's is asked of Facebook, all at once
    const { rows: kept } = await pool.query('SELECT page_id, token FROM facebook_pages');
    const asked = kept.filter(k => got.list.some(p => p.id === k.page_id));
    const states = new Map((await Promise.all(asked.map(k => installedOn(k.page_id, k.token)))).map((s, i) => [asked[i].page_id, s]));
    const stateOf = id => states.get(id) || { installed: null, note: null };
    res.json({
      pages: got.list.map(p => ({ id: p.id, name: p.name, can_advertise: p.tasks.includes('ADVERTISE'), tasks: p.tasks, assigned: byPage.has(p.id) ? assignedOf(byPage.get(p.id)) : null,
        installed: stateOf(p.id).installed, installed_note: stateOf(p.id).note, leads: leads.get(p.id) || null })),
      lost: given.filter(g => !got.list.some(p => p.id === g.page_id)).map(g => ({ id: g.page_id, name: g.page_name, assigned: assignedOf(g), leads: leads.get(g.page_id) || null })),
    });
  } catch (err) { next(err); }
});

// What a Page can be given to: every workspace with its lead webhooks.
router.get('/facebook/targets', requireAdmin, async (req, res, next) => {
  try {
    const { rows: workspaces } = await pool.query('SELECT id, name FROM workspaces ORDER BY lower(name), id');
    const { rows: hooks } = await pool.query('SELECT id, workspace_id, name, active FROM workspace_webhook ORDER BY workspace_id, id');
    res.json({ workspaces: workspaces.map(w => ({ id: w.id, name: w.name, webhooks: hooks.filter(h => h.workspace_id === w.id).map(h => ({ id: h.id, name: h.name, active: !!h.active })) })) });
  } catch (err) { next(err); }
});

// A Page is given to a workspace: its leads will go to that lead webhook of it. The Page must be one of the
// connected account's, and one it may advertise on; its own token is taken from Facebook's answer and sealed.
router.put('/facebook/pages/:pageId', requireAdmin, async (req, res, next) => {
  try {
    const pageId = pageIdOf(req.params.pageId), workspaceId = idOf(req.body && req.body.workspace_id), webhookId = idOf(req.body && req.body.webhook_id);
    if (!pageId) return refuse(res, 'page');
    if (!workspaceId || !webhookId) return refuse(res, 'target');
    const { rows: [hook] } = await pool.query('SELECT h.id FROM workspace_webhook h JOIN workspaces w ON w.id = h.workspace_id WHERE h.id = $1 AND h.workspace_id = $2', [webhookId, workspaceId]);
    if (!hook) return refuse(res, 'target');
    const got = await accountPages();
    if (got.code) return refuse(res, got.code, got.detail);
    const page = got.list.find(p => p.id === pageId);
    if (!page) return refuse(res, 'page');
    if (!page.tasks.includes('ADVERTISE') || !page.token) return refuse(res, 'no_advertise');
    // the app is installed on the Page first: a Page whose leads would not arrive is not given
    try { await facebook.subscribePage(pageId, page.token); }
    catch (err) {
      if (!isFacebooks(err)) throw err;
      return err.code === 'rejected' ? refuse(res, 'subscribe', err.message) : refuse(res, err.code);
    }
    await pool.query(
      `INSERT INTO facebook_pages (page_id, page_name, workspace_id, webhook_id, token) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (page_id) DO UPDATE SET page_name = $2, workspace_id = $3, webhook_id = $4, token = $5, updated_at = NOW()`,
      [pageId, page.name, workspaceId, webhookId, sealKey(page.token)]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// The app is taken off a Page at Facebook, with the Page's own token as it was kept: true only when Facebook
// confirmed. Never an error — a token that cannot be opened, Facebook away or refusing all mean "not confirmed".
async function unsubscribe(pageId, sealed) {
  if (!facebook.isConfigured() || !pageIdOf(pageId)) return false;
  try { await facebook.unsubscribePage(pageId, openKey(sealed)); return true; }
  catch { return false; }
}

// A Page is taken back: its leads go nowhere any more. The row is gone first; what Facebook then says changes
// nothing about that.
router.delete('/facebook/pages/:pageId', requireAdmin, async (req, res, next) => {
  try {
    const pageId = pageIdOf(req.params.pageId);
    if (!pageId) return refuse(res, 'page');
    const { rows: [row] } = await pool.query('DELETE FROM facebook_pages WHERE page_id = $1 RETURNING token', [pageId]);
    res.json({ success: true, unsubscribed: row ? await unsubscribe(pageId, row.token) : false });
  } catch (err) { next(err); }
});

// The connection is forgotten, and every Page is taken back with it — in one statement, so that no Page stays given
// under a connection that is gone. The app is then taken off each of those Pages at Facebook, as far as Facebook lets it.
router.delete('/facebook', requireAdmin, async (req, res, next) => {
  try {
    const { rows: given } = await pool.query('SELECT page_id, token FROM facebook_pages');
    await pool.query('WITH taken AS (DELETE FROM facebook_pages) DELETE FROM platform_settings WHERE key = $1', [KEY]);
    await Promise.allSettled(given.map(g => unsubscribe(g.page_id, g.token)));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Where Facebook is to tell this server of a new lead, and whether the app is registered for it. Asked with the
// app's own token: no account has to be connected. Facebook not answering is no refusal here — the address and the
// word are told all the same, with why the rest is not known.
router.get('/facebook/receiver', requireAdmin, async (req, res, next) => {
  try {
    if (!facebook.isConfigured()) return refuse(res, 'not_configured');
    const out = { callback_url: receiveUrl(req), verify_token: facebook.verifyToken(), registered: null, elsewhere: null, error: null };
    try {
      const r = await facebook.receiver();
      out.registered = !!r && r.callback_url === out.callback_url && r.active === true && r.fields.includes('leadgen');
      out.elsewhere = r && r.callback_url && r.callback_url !== out.callback_url ? r.callback_url : null;
    } catch (err) {
      if (!isFacebooks(err)) throw err;
      out.error = err.code === 'unreachable' ? ERRORS.unreachable[1] : err.message;
    }
    res.json(out);
  } catch (err) { next(err); }
});

// The app is registered for this server's address: Facebook asks the address once (routes/facebook-receive.js
// answers) and from then on tells it of every lead of a Page the app is installed on.
router.post('/facebook/receiver', requireAdmin, async (req, res, next) => {
  try {
    if (!facebook.isConfigured()) return refuse(res, 'not_configured');
    try { await facebook.registerReceiver(receiveUrl(req)); }
    catch (err) {
      if (!isFacebooks(err)) throw err;
      return err.code === 'unreachable' ? refuse(res, 'unreachable') : refuse(res, 'receiver', err.message);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
