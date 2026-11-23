/* ═══════════════════════════════════════════════════════════════════════════
   JOURNEY ROUTER — a box with several routes out, each with its own question
   (CUSTOMER_JOURNEY_CHANGES Part 23, 2026-11-23; utils/journey-run.js sends a
   deal down the routes, routes/journey.js saves the box and its lines).

   A router box ("Router") does nothing to the deal. When a deal reaches it —
   after the box's own wait, like every box — each route's question is asked
   about the deal as it is at that moment, and the deal goes on down EVERY
   route whose answer is yes, side by side: from there on it is at several
   places of the workflow at once (the engine keeps a row per route). When no
   route says yes, it goes on along the box's "otherwise" line
   (journey_nodes.else_id). A route, or an "otherwise", that leads nowhere
   ends there.

   WHAT IS SAVED (journey_nodes.config)
     { routes: [{ id, name, when, next_id }] }      1 to MAX_ROUTES routes
       id        a small number that stays the route's own as long as it
                 is saved: a line, and the record, know the route by it. A
                 new route is numbered above every route saved at that
                 moment (so the number of a route removed earlier can come
                 back later)
       name      what the route is called on the board ('' for none)
       when      null — every deal — or one question of a branch box, kept
                 exactly as utils/journey-branch.js checkBranch keeps it
                 (the same fourteen questions, the same comparisons)
       next_id   the box the route leads to, or null. It is the LINE: never
                 taken from what a window sends (checkRouter keeps the saved
                 one), only set by setLine() and relink().

   A route's question names nothing of another workspace: foreignRefs() asks
   the branch box's own check for each.

   Every function takes the pool; nothing here opens the database module.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const branch = require('./journey-branch');   // a route asks one of a branch box's questions

const MAX_ROUTES = 6, MAX_NAME = 60, MAX_ROUTE_ID = 999;
const idOf = v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e10 ? v : null);
const routesOf = config => (config && typeof config === 'object' && Array.isArray(config.routes) ? config.routes.filter(r => r && typeof r === 'object') : []);

// A router box's settings as sent: { config } or { code } — 'router' (no list of routes, too many, a name that is
// too long, an id twice), or the code of a route's question (branch / stage / field / user), with `route`: which
// one, counted from 0. stored: the box's config as it is saved (null for a new box) — a route sent with the id of
// a saved one is that route and keeps its line; every other route is new and leads nowhere yet. tz: the zone of
// who saves it, for a question that compares a day.
function checkRouter(raw, stored = null, { tz } = {}) {
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  const sent = c && Array.isArray(c.routes) ? c.routes : null;
  if (!sent || !sent.length || sent.length > MAX_ROUTES) return { code: 'router' };
  const lines = new Map(routesOf(stored).map(r => [r.id, idOf(r.next_id)]));   // the saved routes' lines, by id
  const routes = [], taken = new Set();
  for (const [i, r] of sent.entries()) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { code: 'router', route: i };
    const name = r.name === undefined || r.name === null ? '' : typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim() : null;
    if (name === null || name.length > MAX_NAME) return { code: 'router', route: i };
    let when = null;
    if (r.when !== undefined && r.when !== null) {
      const asked = branch.checkBranch(r.when, { tz });
      if (asked.code) return { code: asked.code, route: i };
      when = asked.config;
    }
    const id = idOf(r.id) && lines.has(r.id) ? r.id : null;   // a saved route, or (null) a new one
    if (id && taken.has(id)) return { code: 'router', route: i };
    if (id) taken.add(id);
    routes.push({ id, name, when, next_id: id ? lines.get(id) : null });
  }
  // a new route gets the next number: above every saved one (the kept ones are among them)
  let last = Math.max(0, ...lines.keys());
  for (const r of routes) if (!r.id) r.id = ++last;
  if (last > MAX_ROUTE_ID) return { code: 'router' };
  return { config: { routes } };
}

// What the routes' questions name must be the workspace's own: null, or 'stage' / 'field' / 'user'.
async function foreignRefs(db, wid, config) {
  for (const r of routesOf(config)) {
    const foreign = r.when ? await branch.foreignRefs(db, wid, r.when) : null;
    if (foreign) return foreign;
  }
  return null;
}

// The boxes a router's routes lead to: their ids, one per route that leads somewhere.
const lines = config => routesOf(config).map(r => idOf(r.next_id)).filter(Boolean);
// The route `routeId` of a router now leads to `nextId` (null: nowhere): the new config, or null when it has no such route.
function setLine(config, routeId, nextId) {
  const routes = routesOf(config);
  if (!routes.some(r => r.id === routeId)) return null;
  return { ...config, routes: routes.map(r => (r.id === routeId ? { ...r, next_id: idOf(nextId) } : r)) };
}
// Every route that leads to the box `fromId` now leads to `toId` (null: nowhere) — a box was deleted, and what
// stood behind it takes its place. → { config, changed }.
function relink(config, fromId, toId) {
  const routes = routesOf(config), changed = routes.some(r => r.next_id === fromId);
  return { config: changed ? { ...config, routes: routes.map(r => (r.next_id === fromId ? { ...r, next_id: idOf(toId) } : r)) } : config, changed };
}

// The routes a deal goes down now: every route whose question is answered with yes (a route without a question
// always is), in their order — [{ id, no, name, next_id }]. no: the route's place among the routes, counted from 1
// — the number on its foot on the board, and what the record says. x: the row the engine read; now: the moment it
// is asked.
async function taken(pool, x, config, { now = new Date() } = {}) {
  const out = [];
  for (const [i, r] of routesOf(config).entries()) {
    if (!r.when || await branch.holds(pool, x, r.when, { now })) out.push({ id: r.id, no: i + 1, name: r.name || '', next_id: idOf(r.next_id) });
  }
  return out;
}

module.exports = { MAX_ROUTES, MAX_NAME, MAX_ROUTE_ID, checkRouter, foreignRefs, lines, setLine, relink, taken };
