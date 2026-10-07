/* ═══════════════════════════════════════════════════════════════════════════
   LOGIN WALL — the background of the navy panel on the login page.

   A canvas of small louvre slats. Each slat rests tilted away (about 72°) and
   is lit by one fixed light, so the wall reads as a dim, even texture. Slats
   near the pointer tilt toward the viewer in a ring and catch the light; the
   Upgrads logo (public/images/logo.png, 4× supersampled) is painted into an
   offscreen mask, and cells under it brighten as they turn — the grey strokes
   toward white, the sky-blue arrow toward sky — so the logo draws itself
   where the mouse passes. With no pointer the focus wanders slowly and a band of light
   sweeps across every 10–30 s. This is the mechanism of the "Logowand" hero on
   upgrads.de, rebuilt in plain JS: one 2D context, ~6 000 cells, settled cells
   are skipped, nothing runs while #auth-screen is hidden, coarse pointers get
   the idle motion only, and prefers-reduced-motion gets a single still frame.
   No library, no WebGL, no per-cell DOM.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── pure helpers (sliced by tests) ──────────────────────────────────────────
function wallSmooth(v) { const c = v < 0 ? 0 : v > 1 ? 1 : v; return c * c * (3 - 2 * c); }
// The grid for a panel of W×H px, aiming at `target` cells: square-ish cells, never fewer than 6 a side.
function wallGrid(W, H, target) {
  const cell = Math.sqrt((W * H) / target);
  return { cols: Math.max(6, Math.round(W / cell)), rows: Math.max(6, Math.round(H / cell)) };
}
function wallHex(h, fb) {
  const s = String(h || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(s)) return fb;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function wallMix(a, b, t) { return '#' + [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0')).join(''); }

(function () {
  const wrap = document.querySelector('.au-brand');
  const cv = document.querySelector('canvas.au-wall');
  if (!wrap || !cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  const DEG = Math.PI / 180, LEVELS = 14, FAMS = 3;
  const REST = 72 * DEG, MAX_TILT = 60 * DEG, RADIUS = 300, FILL = 0.4, TARGET = 6000;   // dense enough for 7 letters to read
  const MASK_SRC = '/images/logo.png', MASK_X = 0.5, MASK_Y = 0.22, MASK_W = 0.86, MASK_BOOST = 1.6;   // the band above the headline; thin strokes: lift partial coverage
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // Palette: 3 families (plain slat, mark → sky, mark → white) × 14 light levels, from the panel's own tokens.
  const css = getComputedStyle(document.documentElement);
  const tok = (name, fb) => wallHex(css.getPropertyValue(name), fb);
  const ground = tok('--sb-bg', [15, 35, 64]), panel = tok('--navy-500', [61, 109, 169]);
  const sky = tok('--sky-400', [150, 202, 226]), white = [255, 255, 255];
  const palette = [];
  for (const fam of [panel, sky, white]) for (let i = 0; i < LEVELS; i++) palette.push(wallMix(ground, fam, i / (LEVELS - 1)));
  const buckets = palette.map(() => []);

  const logo = new Image();
  let cells = [], size = { w: 0, h: 0, dpr: 1, hw: 8, hh: 8 }, built = null;
  const att = { x: 0, y: 0, tx: 0, ty: 0, live: false, since: 0 };
  let startAt = 0, sweepFrom = -1, nextSweep = -1, last = 0;

  // The mask: the logo PNG (transparent background) drawn at MASK_W of the width onto a 4× oversampled
  // canvas and averaged per cell. inten = how much of the logo covers the cell (alpha, lifted by MASK_BOOST
  // because the strokes are thin); tone = how blue that coverage is (the arrow), which picks the highlight.
  function buildMask(cols, rows) {
    const inten = new Float32Array(cols * rows), tone = new Float32Array(cols * rows);
    if (!logo.complete || !logo.naturalWidth) return { inten, tone };
    const S = 4, m = document.createElement('canvas'); m.width = cols * S; m.height = rows * S;
    const c = m.getContext('2d'); if (!c) return { inten, tone };
    const w = m.width * MASK_W, h = w * (logo.naturalHeight / logo.naturalWidth);
    c.drawImage(logo, m.width * MASK_X - w / 2, m.height * MASK_Y - h / 2, w, h);
    const d = c.getImageData(0, 0, m.width, m.height).data;
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      let a = 0, blue = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const o = ((gy * S + j) * m.width + gx * S + i) * 4, al = d[o + 3];
        a += al; if (d[o + 2] > d[o] + 24) blue += al;                      // b well above r: the sky arrow
      }
      inten[gy * cols + gx] = Math.min(1, (a / (S * S * 255)) * MASK_BOOST);
      tone[gy * cols + gx] = a > 0 ? blue / a : 0;
    }
    return { inten, tone };
  }

  function rebuild() {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (W < 2 || H < 2) return;
    if (built && Math.abs(built.w - W) < 2 && Math.abs(built.h - H) < 90) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const { cols, rows } = wallGrid(W, H, TARGET);
    const cw = W / cols, ch = H / rows;
    size = { w: W, h: H, dpr, hw: cw * FILL, hh: ch * FILL };
    const mask = buildMask(cols, rows);
    const persp = 0.0016, cxm = W / 2, cym = H / 2;
    let seed = 40503;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    cells = [];
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const x = (gx + 0.5) * cw, y = (gy + 0.5) * ch, ra = REST * (0.92 + rnd() * 0.16);
      cells.push({ x, y, a: ra, b: 0, va: 0, vb: 0, ra, g: mask.inten[gy * cols + gx], t: mask.tone[gy * cols + gx], ox: (x - cxm) * persp, oy: (y - cym) * persp, nx: 0, ny: 0, nz: 0, bucket: 0, ready: false, q: new Float32Array(8) });
    }
    if (!built) { att.x = att.tx = W / 2; att.y = att.ty = H / 2; startAt = 0; }
    built = { w: W, h: H };
  }

  // One fixed light, upper-left, in front of the wall.
  const L = [-0.34, -0.44, 0.83], LN = Math.hypot(...L), lx = L[0] / LN, ly = L[1] / LN, lz = L[2] / LN;
  function shadeOf(p) {
    const facing = p.nz > 0 ? p.nz : 0;
    const lam = Math.max(0, p.nx * lx + p.ny * ly + p.nz * lz);
    let shade = 0.06 + 0.5 * facing * facing + 0.42 * lam;
    const gv = p.g * wallSmooth((facing - 0.16) / 0.44);          // the mark shows only on slats that face the viewer
    if (gv > 0.02) shade *= 1 + 0.34 * gv;
    const lvl = Math.min(LEVELS - 1, Math.max(0, Math.round(Math.min(1, shade) * (LEVELS - 1))));
    const fam = gv >= 0.14 ? (p.t > 0.5 ? 1 : 2) : 0;                 // under the logo: the arrow lights sky, the letters white
    return fam * LEVELS + lvl;
  }
  function geometry(p) {
    const ca = Math.cos(p.a), sa = Math.sin(p.a), cb = Math.cos(p.b), sb = Math.sin(p.b);
    p.nx = sa; p.ny = -ca * sb; p.nz = ca * cb;
    const q = p.q, hw = size.hw, hh = size.hh;
    for (let k = 0; k < 4; k++) {
      const sx = (k === 0 || k === 3) ? -hw : hw, sy = k < 2 ? -hh : hh;
      const x2 = sx * ca, y2 = sy * cb + sx * sa * sb, z2 = sy * sb - sx * sa * cb;
      q[k * 2] = p.x + x2 + p.ox * z2; q[k * 2 + 1] = p.y + y2 + p.oy * z2;
    }
  }

  function paint(now) {
    const W = size.w, H = size.h;
    if (W < 2 || !cells.length) return;
    if (!startAt) { startAt = now; last = now; sweepFrom = now + 600; nextSweep = -1; }
    let dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000)); last = now;
    const idle = !att.live || now - att.since > 2600;
    if (!reduce && idle) {                                           // nobody is pointing: the focus wanders
      const t = now / 1000;
      att.tx = W * (0.5 + 0.3 * Math.sin(t * 0.29)); att.ty = H * (0.48 + 0.24 * Math.sin(t * 0.41 + 1.3));
    }
    const follow = Math.min(1, dt * (att.live && !idle ? 11 : 2.2));
    att.x += (att.tx - att.x) * follow; att.y += (att.ty - att.y) * follow;
    let sweepP = 1;
    if (!reduce && sweepFrom >= 0) {                                 // a band of light crosses the wall
      sweepP = Math.min(1, Math.max(0, (now - sweepFrom) / 1500));
      if (sweepP >= 1) { sweepFrom = -1; nextSweep = now + 10000 + Math.random() * 20000; }
    } else if (!reduce && nextSweep >= 0 && now >= nextSweep) {
      if (idle) { sweepFrom = now; nextSweep = -1; sweepP = 0; } else nextSweep = now + 2200;
    }
    const sweepX = (-0.2 + 1.4 * sweepP) * W, bandW = W * 0.19, sweeping = sweepFrom >= 0 && sweepP > 0 && sweepP < 1;
    for (const b of buckets) b.length = 0;
    const cym = H / 2;
    for (let i = 0; i < cells.length; i++) {
      const p = cells[i], dx = p.x - att.x, dy = p.y - att.y, dist = Math.sqrt(dx * dx + dy * dy);
      let w = 1 - wallSmooth(dist / RADIUS);
      if (sweeping) { const wv = 1 - wallSmooth(Math.abs(p.x + (p.y - cym) * 0.26 - sweepX) / bandW); if (wv > w) w = wv; }
      let ta = p.ra, tb = 0;
      if (w > 0.001) { const ring = w * (1 - w) * 4, inv = dist > 0.001 ? 1 / dist : 0; ta = p.ra * (1 - w) - (dx * inv) * MAX_TILT * ring * 0.85; tb = (dy * inv) * MAX_TILT * ring * 0.85; }
      if (reduce) { p.a = ta; p.b = tb; }
      else {
        const da = ta - p.a, db = tb - p.b;
        if (p.ready && Math.abs(da) < 0.0012 && Math.abs(db) < 0.0012 && Math.abs(p.va) < 0.0016 && Math.abs(p.vb) < 0.0016) { buckets[p.bucket].push(i); continue; }   // settled: skip
        p.va += (da * 130 - p.va * 17) * dt; p.vb += (db * 130 - p.vb * 17) * dt;
        p.a += p.va * dt; p.b += p.vb * dt;
      }
      geometry(p); p.bucket = shadeOf(p); p.ready = true; buckets[p.bucket].push(i);
    }
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let bi = 0; bi < buckets.length; bi++) {                   // one fill per colour, not per slat
      const list = buckets[bi]; if (!list.length) continue;
      ctx.fillStyle = palette[bi]; ctx.beginPath();
      for (const idx of list) { const q = cells[idx].q; ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); ctx.closePath(); }
      ctx.fill();
    }
  }

  const active = () => cv.offsetParent !== null && !document.hidden;   // #auth-screen shown and the tab visible
  function tick(now) {
    if (!active()) { last = 0; setTimeout(() => requestAnimationFrame(tick), 400); return; }   // logged in: idle at 2.5 checks/s, no painting
    if (!last) last = now;
    paint(now);
    if (reduce) return;                                              // one still frame; repainted only on resize
    requestAnimationFrame(tick);
  }

  if (!coarse && !reduce) {
    const onMove = e => {
      const r = wrap.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < -60 || y < -60 || x > r.width + 60 || y > r.height + 60) { att.live = false; return; }
      att.tx = x; att.ty = y; att.live = true; att.since = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
  }
  new ResizeObserver(() => { rebuild(); if (reduce) paint(performance.now()); }).observe(wrap);
  logo.onload = () => { built = null; rebuild(); if (reduce) paint(performance.now()); };   // the mask needs the image; the grid is rebuilt once it is here
  logo.src = MASK_SRC;
  rebuild();
  requestAnimationFrame(tick);
})();
