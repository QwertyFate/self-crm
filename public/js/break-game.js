// ═══════════════════════════════════════════════════════════════════════════
// THE BREAK — public/js/break-game.js  (Part 40, 2026-10-20)
//
// A falling-block game in a native dialog, shared by the landing page and the app. The host page opens it with
//   brkOpen({ t, store, player })
//   t       the host's translator for the brk_* keys (each page keeps its own words, in German and English)
//   store   where the high scores live: { scope: 'browser' | 'team', load() → Promise<entries>, save(entry) →
//           Promise<entries> }; brkLocalStore(key) keeps the ten best in this browser
//   player  a name to save under without asking (a signed-in user), or nothing (the page asks for one)
// Ten by twenty, seven pieces from a shuffled bag, hold (once per piece), the shadow where the piece will land, the
// next piece, soft and hard drops, levels, a points pop on clears, pause, and the high score board. The loop runs only
// while the dialog is open; closing it or hiding the tab pauses. The rules and the board's ranking are pure functions,
// so the suite runs them; everything else draws on canvases in the host's own colour tokens.
//
//   01 the rules (pure)        02 the high score board (pure)    03 the state, the words, the markup
//   04 the game                05 drawing                         06 the loop, opening, events
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

/* ── 01 · the rules (pure) ────────────────────────────────────────────── */
const BRK_W = 10, BRK_H = 20;
const BRK_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const BRK_PIECES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const BRK_COLORS = ['--info', '--warning', '--violet', '--success', '--danger', '--brand', '--teal-600'];
const BRK_KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', x: 'rotate', X: 'rotate', z: 'back', Z: 'back', ' ': 'drop', c: 'hold', C: 'hold', Shift: 'hold', p: 'pause', P: 'pause' };
function brkEmpty() { return Array.from({ length: BRK_H }, () => Array(BRK_W).fill(0)); }
// dir 1: clockwise, dir -1: counter-clockwise.
function brkRotate(m, dir) { const n = m.length; return m.map((row, y) => row.map((_, x) => dir < 0 ? m[x][n - 1 - y] : m[n - 1 - x][y])); }
// Off the sides or the floor, or on a settled block, collides; above the top is open air.
function brkCollides(board, m, x, y) {
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
    if (!m[r][c]) continue;
    const bx = x + c, by = y + r;
    if (bx < 0 || bx >= BRK_W || by >= BRK_H) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
}
function brkMerge(board, m, x, y, color) {
  const next = board.map(row => row.slice());
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c] && y + r >= 0) next[y + r][x + c] = color;
  return next;
}
function brkClear(board) {
  const kept = board.filter(row => row.some(v => !v));
  const cleared = BRK_H - kept.length;
  return { board: Array.from({ length: cleared }, () => Array(BRK_W).fill(0)).concat(kept), cleared };
}
function brkScore(cleared, level) { return [0, 100, 300, 500, 800][cleared] * level; }
function brkLevel(lines) { return 1 + Math.floor(lines / 10); }
function brkInterval(level) { return Math.max(90, 800 - (level - 1) * 75); }
// Seven pieces in a shuffled bag, each exactly once: no long droughts, no floods.
function brkBag(rand) { const b = BRK_TYPES.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function brkGhost(board, m, x, y) { let gy = y; while (!brkCollides(board, m, x, gy + 1)) gy++; return gy; }
function brkSpawn(type) { const m = BRK_PIECES[type]; return { type, m, x: Math.floor((BRK_W - m[0].length) / 2), y: type === 'I' ? -1 : 0 }; }
// Hold: the first hold parks the piece and the next one comes from the queue; later holds swap the two.
function brkHoldSwap(cur, held) { return held ? { cur: held, held: cur, fromQueue: false } : { cur: null, held: cur, fromQueue: true }; }

/* ── 02 · the high score board (pure) ─────────────────────────────────── */
const BRK_BOARD_MAX = 10, BRK_NAME_MAX = 16;
// Best first; equal scores keep the earlier entry ahead. Only scores above zero count.
function brkRank(list, entry, max) {
  const all = (Array.isArray(list) ? list : []).concat(entry ? [entry] : []).filter(e => e && Number.isFinite(e.score) && e.score > 0);
  all.sort((a, b) => b.score - a.score || (a.at || 0) - (b.at || 0));
  const top = all.slice(0, max);
  return { list: top, place: entry ? top.indexOf(entry) : -1 };
}
function brkQualifies(list, score, max) { return score > 0 && (list.length < max || score > list[list.length - 1].score); }
function brkCleanName(s) { return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, BRK_NAME_MAX); }
// The ten best, kept in this browser under the host's key.
function brkLocalStore(key) {
  const read = () => {
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v.filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score)) : []; }
    catch (e) { return []; }
  };
  return {
    scope: 'browser',
    load: () => Promise.resolve(brkRank(read(), null, BRK_BOARD_MAX).list),
    save: entry => {
      const r = brkRank(read(), entry, BRK_BOARD_MAX);
      try { localStorage.setItem(key, JSON.stringify(r.list)); } catch (e) { /* private mode */ }
      return Promise.resolve(r.list);
    },
  };
}

/* ── 03 · the state, the words, the markup ────────────────────────────── */
const BRK = { opts: null, dlg: null, board: null, piece: null, next: null, held: null, canHold: true, bag: [], score: 0, lines: 0, level: 1, over: false, paused: false, running: false, raf: 0, last: 0, acc: 0, dirty: true, colors: [], ground: '', gridline: '', view: 'play', entries: [], place: -1, saved: false, saving: false };
function brkT(k, vars) { return BRK.opts && typeof BRK.opts.t === 'function' ? BRK.opts.t(k, vars) : k; }
function brkEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const BRK_ICONS = {
  x: 'M6 6l12 12M18 6L6 18', left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5', drop: 'M12 4v11M7 10l5 5 5-5M5 20h14', hold: 'M7 4h10v16l-5-3.5L7 20z',
};
function brkIcon(name) { return `<svg class="brk-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${BRK_ICONS[name]}"/></svg>`; }
function brkLastName() { try { return localStorage.getItem('break_last_name') || ''; } catch (e) { return ''; } }
function brkMarkup() {
  const w = k => brkEsc(brkT(k));   // the host's words, escaped (named w, not t: the app's t() reads its own dictionary)
  const key = (k, icon, label) => `<button type="button" class="brk-key" data-act="key" data-key="${k}" aria-label="${w(label)}">${brkIcon(icon)}</button>`;
  return `<div class="brk-in">
    <div class="brk-head"><h2 class="brk-title" id="brk-title">${w('brk_title')}</h2><button type="button" class="brk-x" data-act="close" aria-label="${w('brk_close')}">${brkIcon('x')}</button></div>
    <div class="brk-body">
      <div class="brk-stage">
        <canvas class="brk-canvas" id="brk-canvas" tabindex="0" autofocus role="img" aria-label="${w('brk_field')}"></canvas>
        <div class="brk-layer" id="brk-layer" hidden></div>
      </div>
      <div class="brk-side">
        <div class="brk-minis">
          <div class="brk-mini"><p class="brk-label">${w('brk_hold')}</p><canvas class="brk-mini-canvas" id="brk-held" aria-hidden="true"></canvas></div>
          <div class="brk-mini"><p class="brk-label">${w('brk_next')}</p><canvas class="brk-mini-canvas" id="brk-next" aria-hidden="true"></canvas></div>
        </div>
        <dl class="brk-stats">
          <dt>${w('brk_score')}</dt><dd id="brk-score">0</dd>
          <dt>${w('brk_lines')}</dt><dd id="brk-lines">0</dd>
          <dt>${w('brk_level')}</dt><dd id="brk-level">1</dd>
          <dt>${w('brk_record')}</dt><dd id="brk-record">0</dd>
        </dl>
        <p class="brk-pop" id="brk-pop" aria-hidden="true"></p>
        <div class="brk-actions"><button type="button" class="brk-btn" data-act="pause" id="brk-pause">${w('brk_pause')}</button><button type="button" class="brk-btn" data-act="board" id="brk-board">${w('brk_board')}</button></div>
        <p class="brk-help">${w('brk_help')}</p>
      </div>
    </div>
    <div class="brk-pad" role="group" aria-label="${w('brk_pad')}">${key('left', 'left', 'brk_key_left')}${key('rotate', 'rotate', 'brk_key_rotate')}${key('right', 'right', 'brk_key_right')}${key('down', 'down', 'brk_key_down')}${key('drop', 'drop', 'brk_key_drop')}${key('hold', 'hold', 'brk_key_hold')}</div>
  </div>`;
}
function brkListHtml() {
  if (!BRK.entries.length) return `<p class="brk-empty">${brkEsc(brkT('brk_board_empty'))}</p>`;
  return `<ol class="brk-list">${BRK.entries.map((e, i) => `<li class="brk-row${i === BRK.place ? ' is-me' : ''}"><span class="brk-rank">${i + 1}</span><span class="brk-name">${brkEsc(e.name)}</span><span class="brk-pts">${brkEsc(e.score)}</span></li>`).join('')}</ol>`;
}
// The layer over the field: nothing while playing; the board when asked for; the end with the name form and the board.
function brkRenderLayer() {
  const layer = document.getElementById('brk-layer'); if (!layer) return;
  layer.hidden = BRK.view === 'play';
  if (BRK.view === 'play') { layer.innerHTML = ''; return; }
  const scope = `<p class="brk-scope">${brkEsc(brkT(BRK.opts && BRK.opts.store && BRK.opts.store.scope === 'team' ? 'brk_scope_team' : 'brk_scope_browser'))}</p>`;
  if (BRK.view === 'board') {
    layer.innerHTML = `<p class="brk-sheet-t">${brkEsc(brkT('brk_board'))}</p>${brkListHtml()}${scope}<button type="button" class="brk-btn brk-btn-primary" data-act="back">${brkEsc(brkT('brk_back'))}</button>`;
    return;
  }
  const ask = !BRK.saved && !(BRK.opts && BRK.opts.player) && brkQualifies(BRK.entries, BRK.score, BRK_BOARD_MAX);
  const form = ask ? `<form class="brk-form" data-form="name"><label class="brk-label" for="brk-name">${brkEsc(brkT('brk_name_label'))}</label><div class="brk-form-row"><input class="brk-input" id="brk-name" name="name" maxlength="${BRK_NAME_MAX}" autocomplete="nickname" value="${brkEsc(brkLastName())}"><button type="submit" class="brk-btn brk-btn-primary"${BRK.saving ? ' disabled' : ''}>${brkEsc(brkT('brk_save'))}</button></div></form>` : '';
  const place = BRK.place >= 0 ? `<p class="brk-place">${brkEsc(brkT('brk_place', { n: BRK.place + 1 }))}</p>` : '';
  layer.innerHTML = `<p class="brk-sheet-t">${brkEsc(brkT('brk_over', { n: BRK.score }))}</p>${place}${form}${brkListHtml()}${scope}<button type="button" class="brk-btn brk-btn-primary" data-act="again">${brkEsc(brkT('brk_again'))}</button>`;
  if (ask) { const input = layer.querySelector('#brk-name'); if (input) input.focus(); }
}
function brkHud() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  set('brk-score', BRK.score); set('brk-lines', BRK.lines); set('brk-level', BRK.level);
  set('brk-record', BRK.entries.length ? BRK.entries[0].score : 0);
  const pause = document.getElementById('brk-pause');
  if (pause) { pause.textContent = brkT(BRK.paused ? 'brk_resume' : 'brk_pause'); pause.disabled = BRK.over || BRK.view !== 'play'; }
  const board = document.getElementById('brk-board'); if (board) board.disabled = BRK.view !== 'play';
}
function brkPop(n) {
  const el = document.getElementById('brk-pop'); if (!el) return;
  el.textContent = '+' + n;
  el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
}

/* ── 04 · the game ────────────────────────────────────────────────────── */
function brkTake() { if (!BRK.bag.length) BRK.bag = brkBag(Math.random); return BRK.bag.shift(); }
function brkPlace(type) {
  BRK.piece = brkSpawn(type);
  if (brkCollides(BRK.board, BRK.piece.m, BRK.piece.x, BRK.piece.y)) brkOver();
}
function brkSpawnNext() { const type = BRK.next || brkTake(); BRK.next = brkTake(); brkPlace(type); }
function brkNew() {
  Object.assign(BRK, { board: brkEmpty(), piece: null, next: null, held: null, canHold: true, bag: [], score: 0, lines: 0, level: 1, over: false, paused: false, acc: 0, dirty: true, view: 'play', place: -1, saved: false, saving: false });
  brkSpawnNext(); brkHud(); brkRenderLayer();
}
function brkLive() { return !!BRK.piece && !BRK.over && !BRK.paused && BRK.view === 'play'; }
function brkMove(dx, dy) {
  if (!brkLive()) return false;
  const p = BRK.piece;
  if (brkCollides(BRK.board, p.m, p.x + dx, p.y + dy)) return false;
  p.x += dx; p.y += dy; BRK.dirty = true;
  return true;
}
// A turn that hits a wall or a block tries a step aside (one, then two) and one up before it gives up.
function brkTurn(dir) {
  if (!brkLive() || BRK.piece.type === 'O') return;
  const p = BRK.piece, m = brkRotate(p.m, dir);
  for (const [kx, ky] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
    if (!brkCollides(BRK.board, m, p.x + kx, p.y + ky)) { p.m = m; p.x += kx; p.y += ky; BRK.dirty = true; return; }
  }
}
// Once per piece: the next hold is allowed again only after a piece has landed.
function brkHold() {
  if (!brkLive() || !BRK.canHold) return;
  const r = brkHoldSwap(BRK.piece.type, BRK.held);
  BRK.held = r.held; BRK.canHold = false;
  if (r.fromQueue) brkSpawnNext(); else brkPlace(r.cur);
  BRK.acc = 0; BRK.dirty = true;
}
function brkLock() {
  const p = BRK.piece;
  if (p.m.some((row, r) => row.some((v, c) => v && p.y + r < 0))) { brkOver(); return; }
  const { board, cleared } = brkClear(brkMerge(BRK.board, p.m, p.x, p.y, BRK_TYPES.indexOf(p.type) + 1));
  const gained = brkScore(cleared, BRK.level);
  BRK.board = board; BRK.lines += cleared; BRK.score += gained; BRK.level = brkLevel(BRK.lines); BRK.canHold = true;
  if (gained) brkPop(gained);
  brkSpawnNext(); brkHud(); BRK.dirty = true;
}
function brkFall() { if (!brkMove(0, 1)) brkLock(); }
function brkSoft() {
  if (!brkLive()) return;
  if (brkMove(0, 1)) { BRK.score += 1; brkHud(); } else brkLock();
  BRK.acc = 0;
}
function brkDrop() {
  if (!brkLive()) return;
  const p = BRK.piece, gy = brkGhost(BRK.board, p.m, p.x, p.y);
  BRK.score += 2 * (gy - p.y); p.y = gy;
  brkLock();
}
// The end: with a player name the score goes straight to the board; without one, a good enough score asks for a name.
function brkOver() {
  BRK.over = true; BRK.dirty = true; BRK.view = 'over'; BRK.place = -1; BRK.saved = false;
  brkHud(); brkRenderLayer();
  if (BRK.opts && BRK.opts.player && BRK.score > 0) brkSave(BRK.opts.player);
}
function brkSave(name) {
  if (BRK.saving || BRK.saved || !BRK.opts || !BRK.opts.store) return;
  const entry = { name: brkCleanName(name) || brkT('brk_name_default'), score: BRK.score, lines: BRK.lines, level: BRK.level, at: Date.now() };
  if (!BRK.opts.player) { try { localStorage.setItem('break_last_name', entry.name); } catch (e) { /* private mode */ } }
  BRK.saving = true; brkRenderLayer();
  Promise.resolve(BRK.opts.store.save(entry)).then(list => {
    BRK.entries = Array.isArray(list) ? list : BRK.entries;
    BRK.place = BRK.entries.findIndex(e => e.mine === true || (e.score === entry.score && e.at === entry.at && e.name === entry.name));
    BRK.saved = true;
  }).catch(() => { BRK.saved = false; }).then(() => { BRK.saving = false; brkHud(); brkRenderLayer(); });
}
function brkPause() { if (BRK.over || !BRK.board || BRK.view !== 'play') return; BRK.paused = !BRK.paused; BRK.dirty = true; brkHud(); }
function brkAct(a) {
  if (BRK.view !== 'play') return;
  if (a === 'pause') brkPause();
  else if (a === 'left') brkMove(-1, 0);
  else if (a === 'right') brkMove(1, 0);
  else if (a === 'down') brkSoft();
  else if (a === 'rotate') brkTurn(1);
  else if (a === 'back') brkTurn(-1);
  else if (a === 'drop') brkDrop();
  else if (a === 'hold') brkHold();
}

/* ── 05 · drawing ─────────────────────────────────────────────────────── */
// The host's own colours, read once per opening: the stage colours for the pieces, the surface, the soft line.
function brkColors() {
  const cs = getComputedStyle(document.documentElement);
  BRK.colors = BRK_COLORS.map(v => cs.getPropertyValue(v).trim() || 'gray');
  BRK.ground = cs.getPropertyValue('--surface').trim() || 'black';
  BRK.gridline = cs.getPropertyValue('--line-soft').trim() || 'gray';
}
function brkFit(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
function brkCell(ctx, x, y, s, color, alpha) {
  const pad = Math.max(1, s * .06), r = s * .18;
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x * s + pad, y * s + pad, s - 2 * pad, s - 2 * pad, r); else ctx.rect(x * s + pad, y * s + pad, s - 2 * pad, s - 2 * pad);
  ctx.fill(); ctx.globalAlpha = 1;
}
// A small piece centred in a small canvas: the held one (faded while it cannot be swapped) and the next one.
function brkMini(cv, type, alpha) {
  if (!cv) return;
  brkFit(cv);
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!type) return;
  const m = BRK_PIECES[type], s = Math.min(cv.width / 5, cv.height / 3), cells = [];
  m.forEach((row, r) => row.forEach((v, c) => { if (v) cells.push([c, r]); }));
  const cs = cells.map(q => q[0]), rs = cells.map(q => q[1]);
  const ox = (cv.width / s - (Math.max(...cs) - Math.min(...cs) + 1)) / 2 - Math.min(...cs), oy = (cv.height / s - (Math.max(...rs) - Math.min(...rs) + 1)) / 2 - Math.min(...rs);
  cells.forEach(([c, r]) => brkCell(ctx, c + ox, r + oy, s, BRK.colors[BRK_TYPES.indexOf(type)], alpha));
}
function brkDraw() {
  const cv = document.getElementById('brk-canvas'); if (!cv || !BRK.board) return;
  brkFit(cv);
  const ctx = cv.getContext('2d'), s = cv.width / BRK_W;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = BRK.gridline; ctx.lineWidth = 1;
  for (let x = 1; x < BRK_W; x++) { ctx.beginPath(); ctx.moveTo(Math.round(x * s) + .5, 0); ctx.lineTo(Math.round(x * s) + .5, cv.height); ctx.stroke(); }
  for (let y = 1; y < BRK_H; y++) { ctx.beginPath(); ctx.moveTo(0, Math.round(y * s) + .5); ctx.lineTo(cv.width, Math.round(y * s) + .5); ctx.stroke(); }
  BRK.board.forEach((row, y) => row.forEach((v, x) => { if (v) brkCell(ctx, x, y, s, BRK.colors[v - 1], 1); }));
  const p = BRK.piece;
  if (p && !BRK.over) {
    const color = BRK.colors[BRK_TYPES.indexOf(p.type)], gy = brkGhost(BRK.board, p.m, p.x, p.y);
    p.m.forEach((row, r) => row.forEach((v, c) => { if (v && gy + r >= 0) brkCell(ctx, p.x + c, gy + r, s, color, .22); }));
    p.m.forEach((row, r) => row.forEach((v, c) => { if (v && p.y + r >= 0) brkCell(ctx, p.x + c, p.y + r, s, color, 1); }));
  }
  if (BRK.paused) { ctx.globalAlpha = .55; ctx.fillStyle = BRK.ground; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
  brkMini(document.getElementById('brk-held'), BRK.held, BRK.canHold ? 1 : .35);
  brkMini(document.getElementById('brk-next'), BRK.next, 1);
  BRK.dirty = false;
}

/* ── 06 · the loop, opening, events ───────────────────────────────────── */
// Gravity: a fixed step per level, measured on the frame clock; a long gap (a hidden tab) counts as a quarter second at most.
function brkLoop(now) {
  if (!BRK.running) return;
  const dt = BRK.last ? Math.min(250, now - BRK.last) : 0; BRK.last = now;
  if (!BRK.paused && !BRK.over && BRK.view === 'play') {
    BRK.acc += dt;
    const step = brkInterval(BRK.level);
    while (BRK.acc >= step && !BRK.over) { BRK.acc -= step; brkFall(); }
  }
  if (BRK.dirty) brkDraw();
  BRK.raf = requestAnimationFrame(brkLoop);
}
function brkRun() { if (BRK.running) return; BRK.running = true; BRK.last = 0; BRK.raf = requestAnimationFrame(brkLoop); }
function brkHalt() { BRK.running = false; cancelAnimationFrame(BRK.raf); }
function brkMount() {
  if (BRK.dlg) return BRK.dlg;
  const d = document.createElement('dialog');
  d.className = 'brk'; d.id = 'brk'; d.setAttribute('aria-labelledby', 'brk-title');
  document.body.appendChild(d); BRK.dlg = d;
  d.addEventListener('close', () => { brkHalt(); if (BRK.board && !BRK.over) BRK.paused = true; });
  d.addEventListener('click', e => {
    if (e.target === d) { d.close(); return; }   // the backdrop
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'close') d.close();
    else if (a === 'pause') brkPause();
    else if (a === 'board') { BRK.paused = true; BRK.view = 'board'; BRK.dirty = true; brkHud(); brkRenderLayer(); }
    else if (a === 'back') { BRK.view = 'play'; BRK.paused = false; BRK.dirty = true; brkHud(); brkRenderLayer(); const cv = document.getElementById('brk-canvas'); if (cv) cv.focus(); }
    else if (a === 'again') { brkNew(); const cv = document.getElementById('brk-canvas'); if (cv) cv.focus(); }
    else if (a === 'key') brkAct(b.dataset.key);
  });
  d.addEventListener('submit', e => {
    const f = e.target.closest('[data-form="name"]'); if (!f) return;
    e.preventDefault();
    const input = f.querySelector('#brk-name'); brkSave(input ? input.value : '');
  });
  d.addEventListener('keydown', e => {
    e.stopPropagation();                                                               // the page's own shortcuts stay quiet behind the game
    if (e.target.closest('input, textarea')) return;                                   // typing a name is typing
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button')) return;      // a focused button keeps its own keys
    const a = BRK_KEYS[e.key]; if (!a) return;
    e.preventDefault(); brkAct(a);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && BRK.running && BRK.board && !BRK.over && BRK.view === 'play') { BRK.paused = true; BRK.dirty = true; brkHud(); } });
  window.addEventListener('resize', () => { BRK.dirty = true; });
  return d;
}
// Opening: the words in the host's current language, the colours of the moment, the board from the store. A game that
// was paused by closing continues; a finished one starts over.
function brkOpen(opts) {
  BRK.opts = opts || {};
  const d = brkMount(); if (typeof d.showModal !== 'function') return;
  d.innerHTML = brkMarkup();
  brkColors();
  if (!BRK.board || BRK.over) brkNew(); else { BRK.paused = false; BRK.view = 'play'; brkHud(); brkRenderLayer(); }
  if (!d.open) d.showModal();
  BRK.dirty = true; brkRun();
  Promise.resolve(BRK.opts.store ? BRK.opts.store.load() : []).then(list => {
    BRK.entries = Array.isArray(list) ? list : [];
    brkHud(); if (BRK.view !== 'play') brkRenderLayer();
  }).catch(() => { /* the game plays without a board */ });
}
