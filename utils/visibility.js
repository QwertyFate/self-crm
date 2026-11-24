/* ═══════════════════════════════════════════════════════════════════════════
   Who sees which deal and which contact.

   THE SWITCH  workspaces.members_own_only, set by an owner or admin in
   Settings → Team. Off (the default): everyone in the workspace sees
   everything, as before. On: a MEMBER sees only what is theirs. Owners and
   admins always see everything.

   middleware/auth.js reads the switch in its one query per request and puts
   the answer for THIS caller on req.ownOnly (true only for a member of a
   workspace that has it on). Nothing here asks the database.

   WHAT IS "THEIRS"
     a deal     assigned to the member — or assigned to NOBODY while its
                contact is assigned to the member (a deal an import or a lead
                webhook made without an assignee follows its contact);
     a contact  assigned to the member — or the contact of a deal assigned to
                the member (their deal would have no name or number otherwise)
                — or any supplier (suppliers are an address book, not leads).
   A member may DELETE a contact only when it is assigned to them (or is a
   supplier): seeing somebody else's contact through a deal is not owning it.

   HOW A ROUTE USES IT  each function returns a piece of SQL to put after the
   statement's own WHERE conditions, and pushes the member's id onto `params`.
   For everyone who is not held to their own it returns '' and pushes nothing,
   so the statement is exactly the one that shipped:

     const params = [req.workspaceId];
     ... WHERE d.workspace_id = $1 ${visibility.deals(req, params)}

   `alias` is the name the statement uses for the table: 'd' / 'c' in the
   joined lists, 'deals' / 'contacts' in a bare UPDATE or DELETE. It is always
   a word written in the route, never anything a caller sent.

   WHAT HANGS ON A DEAL OR A CONTACT (a note, a comment, a document, a task,
   a call, a booking, a workflow's record) follows it — linked():
     it names a deal      → seen when that deal is seen (even when it also
                            names a contact: a note on a deal is about the deal);
     it names a contact   → seen when that contact is seen;
     it names neither     → not about anybody's lead: seen by everyone, unless
                            the route says { orphans: false } (then owners and
                            admins only).
   `cols` are the statement's own column expressions, written in the route:
     ... WHERE a.workspace_id = $1 ${visibility.linked(req, params, { deal: 'a.deal_id', contact: 'a.contact_id' })}
   Where a piece after the WHERE does not fit (a FILTER, a JOIN's ON), `rules`
   gives the bare conditions; the route pushes req.userId itself and passes the
   placeholder's number.
   ═══════════════════════════════════════════════════════════════════════════ */

const restricted = req => req.ownOnly === true;

const dealRule = (d, n) =>
  `(${d}.assigned_to = $${n} OR (${d}.assigned_to IS NULL AND EXISTS (SELECT 1 FROM contacts vc WHERE vc.id = ${d}.contact_id AND vc.assigned_to = $${n})))`;
const contactOwnRule = (c, n) =>
  `(${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier')`;
const contactRule = (c, n) =>
  `(${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier' OR EXISTS (SELECT 1 FROM deals vd WHERE vd.contact_id = ${c}.id AND vd.assigned_to = $${n}))`;

const linkedRule = ({ deal, contact, orphans = true }, n) => {
  const whens = [];
  if (deal)    whens.push(`WHEN ${deal} IS NOT NULL THEN EXISTS (SELECT 1 FROM deals ld WHERE ld.id = ${deal} AND ${dealRule('ld', n)})`);
  if (contact) whens.push(`WHEN ${contact} IS NOT NULL THEN EXISTS (SELECT 1 FROM contacts lc WHERE lc.id = ${contact} AND ${contactRule('lc', n)})`);
  return `(CASE ${whens.join(' ')} ELSE ${orphans ? 'true' : 'false'} END)`;
};

function scope(rule) {
  return (req, params, alias) => {
    if (!restricted(req)) return '';
    params.push(req.userId);
    return ` AND ${rule(alias, params.length)}`;
  };
}

const deals       = (req, params, alias = 'd') => scope(dealRule)(req, params, alias);
const contacts    = (req, params, alias = 'c') => scope(contactRule)(req, params, alias);
const ownContacts = (req, params, alias = 'c') => scope(contactOwnRule)(req, params, alias);
const linked      = (req, params, cols) => scope(linkedRule)(req, params, cols);

// One deal / one contact by id: may this caller see it? Always true for whoever is not held to their own
// (the route's own statement still decides whether the row exists at all).
async function seesDeal(pool, req, id) {
  if (!restricted(req)) return true;
  const params = [id, req.workspaceId];
  const { rows } = await pool.query(`SELECT 1 FROM deals d WHERE d.id = $1 AND d.workspace_id = $2${deals(req, params)}`, params);
  return rows.length > 0;
}
async function seesContact(pool, req, id) {
  if (!restricted(req)) return true;
  const params = [id, req.workspaceId];
  const { rows } = await pool.query(`SELECT 1 FROM contacts c WHERE c.id = $1 AND c.workspace_id = $2${contacts(req, params)}`, params);
  return rows.length > 0;
}

// A row by what it names (the ids as the caller or the stored row gives them): the deal decides when there is one,
// else the contact; with neither, `orphans` (true unless the route says otherwise).
async function seesLinked(pool, req, { dealId, contactId, orphans = true } = {}) {
  if (!restricted(req)) return true;
  if (dealId)    return seesDeal(pool, req, dealId);
  if (contactId) return seesContact(pool, req, contactId);
  return orphans;
}

const rules = { deal: dealRule, contact: contactRule, ownContact: contactOwnRule, linked: linkedRule };

module.exports = { restricted, deals, contacts, ownContacts, linked, seesDeal, seesContact, seesLinked, rules };
