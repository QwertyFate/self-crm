/* ═══════════════════════════════════════════════════════════════════════════
   A ROUTER BOX OF A WORKFLOW — several routes out, each with its own question
   (CUSTOMER_JOURNEY_CHANGES Part 24, 2026-11-23; loaded after journey.js,
   which lays the routes out and draws their lines, and after
   journey-branch.js, whose questions a route asks; server:
   utils/journey-router.js keeps the routes, utils/journey-run.js sends a deal
   down them, routes/journey.js saves the box and its lines).

   A router does nothing to the deal. When a deal reaches it — after the box's
   own wait, like every box — each route's question is asked about the deal as
   it is at that moment, and the deal goes on down EVERY route whose answer is
   yes, side by side. When none says yes it takes the "else" line. A route, or
   an "else", that leads nowhere ends there.

   WHAT THE BOX SHOWS  Its name — or how many routes it has — and under it the
   routes one by one: each route's number, then its name or, where it has
   none, its question as a branch box would say it ("Every deal" for a route
   without a question). Under the box stands one foot per route, its number
   on it, and one for "else": each is the handle of that route's own line —
   a click adds a step behind it, a drag onto another box draws the line.

   ITS WINDOW (Part 25)  When it is asked, its name, and its routes row by
   row: each with a name, its condition — one question of a branch box, set
   in that box's own window (openJourneyBranch with `pick`), or none: every
   deal — and buttons to move it up or down and to remove it; "Add a route"
   up to the server's six. A new router starts with two routes that take
   every deal. Only names, order and conditions are sent: a route's LINE is
   the server's to keep (a kept route keeps it, a removed one loses it, a
   new one has none). A member reads the router (journeyRouterView).

   FUNCTION MAP  openJourneyRouter, journeyRouterView;
                 pure: journeyRouterRoutes, journeyRouteLabel,
                 journeyRouterLines, journeyRouterListHtml,
                 journeyRouterFeetHtml, journeyRouterRowsHtml,
                 journeyRouterMoved, journeyRouterConfig
   ═══════════════════════════════════════════════════════════════════════════ */

const JOURNEY_ROUTER_NEW = 2;   // the routes a new router starts with (the server takes 1 to 6)
const JOURNEY_ROUTER_MAX = { routes: 6, name: 60 };   // the server's limits (utils/journey-router.js)

// A router's routes as the server keeps them: [{ id, name, when, next_id }] — an empty list for anything else.
function journeyRouterRoutes(node) {
  const c = node && node.config;
  return c && Array.isArray(c.routes) ? c.routes.filter(r => r && typeof r === 'object') : [];
}
// What a route is called: its name — or, where it has none, its question as a branch box says it, or "Every deal".
function journeyRouteLabel(route) {
  const name = String((route && route.name) || '').trim();
  return name || (route && route.when ? journeyBranchText(route.when) : t('jrt_always'));
}
// What the box says of itself: its name, or how many routes it has — and, as one line of text, the routes in turn.
function journeyRouterLines(node) {
  const routes = journeyRouterRoutes(node), name = String((node && node.title) || '').trim();
  return { title: name || (routes.length === 1 ? t('jrt_one') : tf('jrt_many', { n: routes.length })), text: routes.map((r, i) => `${i + 1} ${journeyRouteLabel(r)}`).join(' · ') };
}
// The routes as a list, one line each: the route's number in the box (the number on its foot), then what it is called.
function journeyRouterListHtml(node) {
  const routes = journeyRouterRoutes(node);
  return routes.length ? `<span class="jr-routes">${routes.map((r, i) => `<span class="jr-route"><b>${i + 1}</b><span>${esc(journeyRouteLabel(r))}</span></span>`).join('')}</span>` : '';
}
// The feet under a router: one per route, in their order, and "else" — each where its line leaves the box
// (journeyPart). Everyone reads them; for an owner or admin each is the handle of its line.
function journeyRouterFeetHtml(node) {
  const id = Number(node.id), left = (side, route) => `left:${Math.round(journeyPart(node, side, route) * 10000) / 100}%`;
  const foot = (cls, side, route, word, aria) => (journeyManage
    ? `<button type="button" class="jr-out jr-side ${cls}" style="${left(side, route)}" data-out="${id}" data-side="${side}"${side === 'route' ? ` data-route="${Number(route)}"` : ''} aria-label="${esc(aria)}" title="${esc(aria)}"><span>${esc(word)}</span></button>`
    : `<span class="jr-side ${cls}" style="${left(side, route)}" title="${esc(aria)}">${esc(word)}</span>`);
  return journeyRouterRoutes(node).map((r, i) => foot('is-route', 'route', r.id, String(i + 1), journeyManage ? tf('jrt_route_aria', { n: i + 1 }) : journeyRouteLabel(r))).join('')
    + foot('is-else', 'else', null, t('jrt_else'), t(journeyManage ? 'jrt_else_aria' : 'jrt_else_long'));
}

// A router, to read: when it is asked, its routes one by one, and what happens when none fits — for everyone who
// may not change workflows.
function journeyRouterView(node, why = 'jr_err_forbidden') {
  const says = journeyRouterLines(node);
  return ui.modal({ title: t('jr_title_view'), size: 'md',
    body: `<div class="jr-view" data-kind="router">
        <p class="jr-meta"><b>${esc(t('jr_kind_router'))}</b><span>${esc(journeyWaitText(node.wait_minutes))}</span></p>
        <h3 class="jr-view-title">${esc(says.title)}</h3>
        ${journeyRouterListHtml(node)}
        <p class="jr-view-text">${esc(t('jrt_else_long'))}</p>
        <p class="help">${esc(t(why))}</p></div>`,
    footer: `<button class="btn btn-secondary" data-close autofocus>${esc(t('btn_close'))}</button>` });
}

// The window's rows, one per route: its number (the number on its foot), its name, its condition as the box says
// it — with a way to set, change or drop it — and the buttons that move the row or remove it. The only route
// there is cannot be removed.
function journeyRouterRowsHtml(routes) {
  return routes.map((r, i) => {
    const n = i + 1;
    const btn = (what, key, glyph, off) => `<button type="button" class="iconbtn" data-rt-${what}="${i}" aria-label="${esc(tf(key, { n }))}" title="${esc(tf(key, { n }))}"${off ? ' disabled' : ''}>${icon(glyph)}</button>`;
    return `<li class="jr-rt"><span class="jr-rt-no" aria-hidden="true">${n}</span><div class="jr-rt-main">
        <input class="input" data-rt-name="${i}" maxlength="${JOURNEY_ROUTER_MAX.name}" autocomplete="off" placeholder="${esc(t('jrt_name_ph'))}" aria-label="${esc(tf('jrt_name_aria', { n }))}" value="${esc(r.name)}">
        <div class="jr-rt-cond"><span class="jr-rt-says">${esc(r.when ? journeyBranchText(r.when) : t('jrt_always'))}</span><button type="button" class="btn btn-ghost btn-sm" data-rt-cond="${i}">${esc(t(r.when ? 'jrt_cond_change' : 'jrt_cond_set'))}</button>${
          r.when ? `<button type="button" class="btn btn-ghost btn-sm" data-rt-clear="${i}">${esc(t('jrt_cond_clear'))}</button>` : ''}</div></div>${
      btn('up', 'jrt_up', 'arrow-up', i === 0)}${btn('down', 'jrt_down', 'arrow-down', i === routes.length - 1)}${btn('del', 'jrt_remove', 'x', routes.length < 2)}</li>`;
  }).join('');
}
// A list with the entry at i moved by one place (by: -1 up, 1 down); unchanged where that is no place.
function journeyRouterMoved(list, i, by) {
  const out = [...list], j = i + by;
  if (!Number.isInteger(i) || i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
// What the window holds, as the settings the route takes: { config }, or { error, part }. A route is sent with its
// id when it is a saved one — by that the server knows it and keeps its line — its name and its condition; never
// a line.
function journeyRouterConfig(now) {
  const routes = Array.isArray(now.routes) ? now.routes : [];
  if (!routes.length || routes.length > JOURNEY_ROUTER_MAX.routes || routes.some(r => String(r.name || '').length > JOURNEY_ROUTER_MAX.name)) return { error: 'jr_err_router', part: 'routes' };
  return { config: { routes: routes.map(r => ({ ...(r.id ? { id: r.id } : {}), name: String(r.name || ''), when: r.when || null })) } };
}

// A router's window: when it is asked, its name, and its routes with their conditions. node null: a new one, behind
// fresh.afterId (on the route or the side fresh says), starting with two routes that take every deal.
function openJourneyRouter(node, fresh) {
  const flow = journeyFlow(), wait = journeyWaitParts(node ? node.wait_minutes : 0);
  const first = node ? journeyRouterRoutes(node).map(r => ({ id: r.id, name: String(r.name || '').trim(), when: r.when || null })) : Array.from({ length: JOURNEY_ROUTER_NEW }, () => ({ id: null, name: '', when: null }));
  const start = { n: String(wait.n), unit: wait.unit, name: node ? String(node.title || '') : '', routes: first.map(r => ({ ...r })) };
  let routes = first.map(r => ({ ...r }));   // the rows as they stand in the window
  const w = journeyWindow({ title: `${t(node ? 'jr_title_edit' : 'jr_title_add')}: ${t('jr_kind_router')}`, size: 'lg', start, remove: node ? async (fail, done) => {
      const ok = await ui.confirm({ title: t('jr_delete_q'), message: tf('jr_delete_msg', { title: journeyRouterLines(node).title }), confirmLabel: t('btn_delete'), danger: true });
      if (!ok) return;
      const res = await journeySend(() => api.del(`/api/journey/nodes/${node.id}`));
      if (res && res.error && res.code === 'not_found') { done({}, 'jr_deleted'); return loadJourney(); }   // deleted by a colleague meanwhile: deleted all the same, read again
      if (done(res, 'jr_deleted')) journeyApply(res.flow);
    } : null,
    body: fid => `<div class="field"><label class="label" for="${fid}-n">${esc(t('jb_f_wait'))}</label>
          <div class="row jr-wait"><input class="input" id="${fid}-n" type="number" min="0" step="1" inputmode="numeric" value="${esc(start.n)}">
            <select class="select" id="${fid}-unit" aria-label="${esc(t('jr_unit_aria'))}">${Object.keys(JOURNEY_UNITS).map(u => journeyOption(u, t('jr_unit_' + u), start.unit)).join('')}</select></div>
          <p class="help">${esc(t('jb_f_wait_hint'))}</p></div>
        <div class="field"><span class="label" id="${fid}-rlabel">${esc(t('jrt_f_routes'))}</span>
          <ol class="jr-rts" id="${fid}-routes" aria-labelledby="${fid}-rlabel" tabindex="-1"></ol>
          <div><button type="button" class="btn btn-ghost btn-sm" data-rt-add>${icon('plus')}${esc(t('jrt_add'))}</button></div>
          <p class="help">${esc(t('jrt_routes_hint'))}</p></div>
        <div class="field"><label class="label" for="${fid}-name">${esc(t('jb_f_name'))}</label>
          <input class="input" id="${fid}-name" maxlength="${JOURNEY_MAX_TITLE}" autocomplete="off" value="${esc(start.name)}"></div>
        <p class="help">${esc(t('jrt_hint'))}</p>`,
    read: el => ({ n: el('n').value.trim(), unit: el('unit').value, name: el('name').value.trim(), routes: routes.map(r => ({ id: r.id, name: String(r.name || '').replace(/\s+/g, ' ').trim(), when: r.when })) }),
    save: async (now, fail, done) => {
      const minutes = journeyWaitMinutes(now.n, now.unit);
      if (minutes === null) return fail(t('jr_err_wait'), 'n');
      const out = journeyRouterConfig(now);
      if (out.error) return fail(t(out.error), out.part);
      const body = { title: now.name, body: '', wait_minutes: minutes, config: out.config };
      const res = await journeySend(() => (node ? api.put(`/api/journey/nodes/${node.id}`, body) : api.post(`/api/journey/flows/${flow.id}/nodes`, { ...body, kind: 'router', ...journeyBehind(fresh) })));
      if (done(res, 'jr_saved')) journeyApply(res.flow);
    } });
  // The rows drawn from `routes`; no route can be added past the server's limit.
  const draw = () => {
    w.el('routes').innerHTML = journeyRouterRowsHtml(routes);
    w.m.el.querySelector('[data-rt-add]').disabled = routes.length >= JOURNEY_ROUTER_MAX.routes;
    w.el('err').hidden = true;
  };
  // The cursor back into row i after the rows were drawn again: the button named, or the row's name.
  const focusRow = (i, part = 'name') => {
    const want = w.m.el.querySelector(`[data-rt-${part}="${i}"]`), f = want && !want.disabled ? want : w.m.el.querySelector(`[data-rt-name="${i}"]`);
    if (f && f.focus) f.focus();
  };
  on(w.m.el, 'input', '[data-rt-name]', (e, f) => { const r = routes[Number(f.dataset.rtName)]; if (r) r.name = f.value; });
  on(w.m.el, 'click', '[data-rt-add]', () => {
    if (routes.length >= JOURNEY_ROUTER_MAX.routes) return;
    routes.push({ id: null, name: '', when: null }); draw(); focusRow(routes.length - 1);
  });
  on(w.m.el, 'click', '[data-rt-del]', (e, b) => {
    const i = Number(b.dataset.rtDel);
    if (routes.length < 2 || !routes[i]) return;   // a router keeps at least one route
    routes.splice(i, 1); draw(); focusRow(Math.min(i, routes.length - 1));
  });
  on(w.m.el, 'click', '[data-rt-up], [data-rt-down]', (e, b) => {
    const up = b.dataset.rtUp !== undefined, i = Number(up ? b.dataset.rtUp : b.dataset.rtDown), by = up ? -1 : 1;
    routes = journeyRouterMoved(routes, i, by); draw(); focusRow(i + by, up ? 'up' : 'down');
  });
  on(w.m.el, 'click', '[data-rt-clear]', (e, b) => { const i = Number(b.dataset.rtClear); if (routes[i]) { routes[i].when = null; draw(); focusRow(i, 'cond'); } });
  // a route's condition is one question of a branch box, asked for in that box's own window
  on(w.m.el, 'click', '[data-rt-cond]', (e, b) => {
    const i = Number(b.dataset.rtCond), r = routes[i];
    if (r) openJourneyBranch(null, null, { config: r.when, title: tf('jrt_cond_title', { n: i + 1 }), done: config => { r.when = config; draw(); focusRow(routes.indexOf(r), 'cond'); } });
  });
  draw();
  return w.m;
}
