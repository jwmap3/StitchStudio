/* Stitch Studio — stitch engine + file writers (DST, VP3).
   Design units are millimetres, origin top-left, y down. */
(function (root) {
  'use strict';
  const S = {};

  // ---------- small geometry helpers
  const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rot = (p, c, s) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  S.dist = hyp;

  function resamplePolyline(pts, step, closed) {
    const P = closed ? pts.concat([pts[0]]) : pts.slice();
    if (P.length < 2) return P.slice();
    const out = [P[0]];
    let carry = 0;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      const d = hyp(a, b);
      if (d === 0) continue;
      let t = step - carry;
      while (t <= d) {
        out.push([a[0] + (b[0] - a[0]) * t / d, a[1] + (b[1] - a[1]) * t / d]);
        t += step;
      }
      carry = d - (t - step);
    }
    const last = P[P.length - 1];
    if (hyp(out[out.length - 1], last) > step * 0.25) out.push(last);
    return out;
  }
  S.resamplePolyline = resamplePolyline;

  // Catmull-Rom smoothing, keeps the extra columns (e.g. width) interpolated
  function smooth(points, closed, per) {
    per = per || 8;
    const n = points.length;
    if (n < 3) return points.map(p => p.slice());
    const out = [];
    const get = i => closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        const q = [];
        for (let j = 0; j < p1.length; j++) {
          q.push(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3));
        }
        out.push(q);
      }
    }
    if (!closed) out.push(points[n - 1].slice());
    return out;
  }
  S.smooth = smooth;

  // ---------- TATAMI FILL (even-odd, holes supported)
  // loops: array of closed polygons [[x,y],...] in mm
  function fillRows(loops, angleDeg, spacing) {
    const th = -angleDeg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
    const R = loops.filter(l => l.length >= 3).map(l => l.map(p => rot(p, c, s)));
    if (!R.length) return { rows: [], c, s };
    let ymin = Infinity, ymax = -Infinity;
    R.forEach(l => l.forEach(p => { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }));
    const edges = [];
    R.forEach(l => { for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a, b] : [b, a]); } });
    const rows = [];
    let k = 0;
    for (let y = ymin + spacing / 2; y < ymax; y += spacing, k++) {
      const xs = [];
      for (const [a, b] of edges) if (y >= a[1] && y < b[1]) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
      xs.sort((u, v) => u - v);
      const segs = [];
      for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.05) segs.push({ x0: xs[i], x1: xs[i + 1], used: false });
      rows.push({ y, k, segs });
    }
    return { rows, c, s };
  }

  function buildSections(rows) {
    const sections = [];
    for (let r = 0; r < rows.length; r++) {
      for (const seg of rows[r].segs) {
        if (seg.used) continue;
        const sec = [{ r, seg }]; seg.used = true;
        let cur = seg;
        for (let q = r + 1; q < rows.length; q++) {
          const cand = rows[q].segs.filter(s2 => !s2.used && s2.x0 < cur.x1 && s2.x1 > cur.x0);
          if (cand.length !== 1) {
            // stop on branching (keeps rows contiguous); take the one with most overlap if several
            if (!cand.length) break;
            const best = cand.reduce((a, b) => (Math.min(a.x1, cur.x1) - Math.max(a.x0, cur.x0)) >= (Math.min(b.x1, cur.x1) - Math.max(b.x0, cur.x0)) ? a : b);
            best.used = true; sec.push({ r: q, seg: best }); cur = best; break;
          }
          cand[0].used = true; sec.push({ r: q, seg: cand[0] }); cur = cand[0];
        }
        sections.push(sec);
      }
    }
    return sections;
  }

  // returns array of "runs": each run is a list of [x,y] stitch points (mm) to be sewn continuously
  function tatami(loops, o) {
    const angle = o.angle || 0, spacing = Math.max(0.15, o.spacing || 0.4), L = Math.max(0.8, o.stitchLen || 3.5), pc = o.pullComp || 0;
    const inset = o.inset || 0;
    const { rows, c, s } = fillRows(loops, angle, spacing);
    const back = p => rot(p, c, -s);
    const secs = buildSections(rows);
    const stag = [0, 1 / 3, 2 / 3];
    const runs = secs.map(sec => {
      const pts = [];
      sec.forEach((it, j) => {
        let a = it.seg.x0 - pc + inset, b = it.seg.x1 + pc - inset;
        if (b - a < 0.2) { const m = (a + b) / 2; a = m - 0.1; b = m + 0.1; }
        const y = rows[it.r].y, off = stag[rows[it.r].k % 3] * L;
        const xs = [a];
        let x = Math.ceil((a + 0.6 - off) / L) * L + off;
        for (; x < b - 0.6; x += L) xs.push(x);
        xs.push(b);
        if (j % 2) xs.reverse();
        xs.forEach(xx => pts.push(back([xx, y])));
      });
      return pts;
    });
    return runs;
  }
  S.tatami = tatami;

  // ---------- FLOW FILL: rows follow user-drawn inclination / flow lines
  function pointIn(p, loops) {
    let inside = false;
    for (const l of loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[i], b = l[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  S.pointIn = pointIn;
  function flowField(guides) {
    // sample guide tangents; direction at p = inverse-distance weighted mean (axial, so sign-free)
    const samples = [];
    guides.forEach(g => {
      const R = resamplePolyline(g.length >= 3 ? smooth(g, false, 6).map(q => [q[0], q[1]]) : g, 0.8, false);
      for (let i = 0; i < R.length; i++) {
        const a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i + 1)];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        samples.push([R[i][0], R[i][1], Math.cos(2 * ang), Math.sin(2 * ang)]);
      }
    });
    return (x, y) => {
      let cx = 0, sy = 0;
      for (const s of samples) { const d2 = (s[0] - x) ** 2 + (s[1] - y) ** 2; const w = 1 / (d2 * d2 + 1e-3); cx += s[2] * w; sy += s[3] * w; }
      const a = Math.atan2(sy, cx) / 2;
      return [Math.cos(a), Math.sin(a)];
    };
  }
  function flowFill(loops, o) {
    const sp = Math.max(0.2, o.spacing || 0.4), L = Math.max(1, o.stitchLen || 3.5), step = 0.25;
    const field = o.__field || flowField(o.flow);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    loops.forEach(l => l.forEach(p => { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); }));
    // occupancy grid for line spacing + inside test cache
    const cell = sp / 2, gw = Math.ceil((maxx - minx) / cell) + 3, gh = Math.ceil((maxy - miny) / cell) + 3;
    const occ = new Map();
    const inside = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) inside[j * gw + i] = pointIn([minx + (i - 1) * cell, miny + (j - 1) * cell], loops) ? 1 : 0;
    const gi = (x, y) => [Math.round((x - minx) / cell) + 1, Math.round((y - miny) / cell) + 1];
    const isIn = (x, y) => { const [i, j] = gi(x, y); return i >= 0 && j >= 0 && i < gw && j < gh && inside[j * gw + i]; };
    const near = (x, y, line, minD) => {
      const [i, j] = gi(x, y), r = Math.ceil(minD / cell) + 1;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const list = occ.get((i + di) + ',' + (j + dj)); if (!list) continue;
        for (const q of list) if (q[2] !== line && (q[0] - x) ** 2 + (q[1] - y) ** 2 < minD * minD) return true;
      }
      return false;
    };
    const mark = (pts, line) => pts.forEach(p => { const [i, j] = gi(p[0], p[1]); const k = i + ',' + j; if (!occ.has(k)) occ.set(k, []); occ.get(k).push([p[0], p[1], line]); });
    let pass2 = false;
    const trace = (seed, line) => {
      const half = dirSign => {
        const out = []; let p = seed.slice(); let prev = null;
        for (let n = 0; n < 4000; n++) {
          let d = field(p[0], p[1]);
          if (prev && d[0] * prev[0] + d[1] * prev[1] < 0) d = [-d[0], -d[1]];
          if (!prev) d = [d[0] * dirSign, d[1] * dirSign];
          const mid = [p[0] + d[0] * step / 2, p[1] + d[1] * step / 2];
          let d2 = field(mid[0], mid[1]); if (d2[0] * d[0] + d2[1] * d[1] < 0) d2 = [-d2[0], -d2[1]];
          const q = [p[0] + d2[0] * step, p[1] + d2[1] * step];
          if (!isIn(q[0], q[1]) || near(q[0], q[1], line, sp * (pass2 ? 0.45 : 0.55))) break;
          out.push(q); prev = d2; p = q;
        }
        return out;
      };
      const a = half(-1).reverse(), b = half(1);
      return a.concat([seed], b);
    };
    const lines = [];
    const queue = [];
    // initial seeds: middle of each guide that lies inside, then a grid sweep for leftovers
    (o.flow || []).forEach(g => { const m = g[Math.floor(g.length / 2)]; if (isIn(m[0], m[1])) queue.push(m.slice()); });
    let gridIdx = 0;
    const gridSeeds = [];
    for (let j = 0; j < gh; j += 2) for (let i = 0; i < gw; i += 2) if (inside[j * gw + i]) gridSeeds.push([minx + (i - 1) * cell, miny + (j - 1) * cell]);
    let seedGap = 0.9;
    while (lines.length < 4000) {
      let seed = queue.shift();
      if (!seed) { while (gridIdx < gridSeeds.length) { const s = gridSeeds[gridIdx++]; if (!near(s[0], s[1], -1, sp * seedGap)) { seed = s; break; } } }
      if (!seed && !pass2) { pass2 = true; seedGap = 0.6; gridIdx = 0; continue; }   // second sweep fills pinch gaps
      if (!seed) break;
      if (!isIn(seed[0], seed[1]) || near(seed[0], seed[1], -1, sp * seedGap)) continue;
      const pts = trace(seed, lines.length);
      if (pts.length < 3) { mark([seed], lines.length); continue; }
      mark(pts, lines.length);
      lines.push(pts);
      // neighbours on both sides become new seeds (keeps rows evenly spaced)
      for (let k = 0; k < pts.length; k += 6) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], dd = Math.hypot(dx, dy) || 1;
        queue.push([pts[k][0] - dy / dd * sp, pts[k][1] + dx / dd * sp], [pts[k][0] + dy / dd * sp, pts[k][1] - dx / dd * sp]);
      }
    }
    // stitches along each row with staggered penetrations; alternate direction for neighbours
    return lines.map((ln, idx) => {
      const pts = idx % 2 ? ln.slice().reverse() : ln;
      const out = [pts[0]];
      const off = [0, 1 / 3, 2 / 3][idx % 3] * L;
      let acc = -off;
      for (let i = 1; i < pts.length; i++) { acc += hyp(pts[i - 1], pts[i]); if (acc >= L) { out.push(pts[i]); acc = 0; } }
      if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
      return out;
    });
  }

  // ---------- object -> stitch "pieces" (continuous point lists) in sewing order
  // ---------- WRAP: satin that turns with the shape. Thread runs straight across the shape,
  // edge to edge, everywhere perpendicular to the nearby outline, so curves (a "3", an "S")
  // get stitches that fan around the bend like hand-digitized lettering.
  function wrapField(loops) {
    const smp = [];
    loops.forEach(l => {
      if (l.length < 3) return;
      const R = resamplePolyline(l, 0.7, true);
      for (let i = 0; i < R.length; i++) {
        const a = R[(i - 2 + R.length) % R.length], b = R[(i + 2) % R.length];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;     // across the outline
        smp.push([R[i][0], R[i][1], Math.cos(2 * ang), Math.sin(2 * ang)]);
      }
    });
    if (!smp.length) return () => [1, 0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    smp.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    // bucket the outline samples so each lookup only visits nearby ones
    const B = 2.0, bw = Math.ceil((x1 - x0) / B) + 1, bh = Math.ceil((y1 - y0) / B) + 1, bins = new Map();
    smp.forEach(q => { const k = Math.floor((q[0] - x0) / B) + Math.floor((q[1] - y0) / B) * bw; if (!bins.has(k)) bins.set(k, []); bins.get(k).push(q); });
    const C = 0.4, gw = Math.ceil((x1 - x0) / C) + 2, gh = Math.ceil((y1 - y0) / C) + 2;
    const gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = x0 + i * C, y = y0 + j * C, bi = Math.floor((x - x0) / B), bj = Math.floor((y - y0) / B);
      let cx = 0, sy = 0, dmin = Infinity;
      for (let R = 0; R < 40; R++) {
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== R) continue;
          const ii = bi + di, jj = bj + dj; if (ii < 0 || jj < 0 || ii >= bw || jj >= bh) continue;
          const list = bins.get(ii + jj * bw); if (!list) continue;
          for (const q of list) { const d2 = (q[0] - x) ** 2 + (q[1] - y) ** 2; dmin = Math.min(dmin, d2); const w = 1 / (d2 * Math.sqrt(d2) + 1e-2); cx += q[2] * w; sy += q[3] * w; }
        }
        if (dmin < Infinity && (R - 1) * B > Math.sqrt(dmin) * 2.2 + 2) break;
      }
      const m = Math.hypot(cx, sy) || 1; gx[j * gw + i] = cx / m; gy[j * gw + i] = sy / m;
    }
    // smooth the direction field so the thread turns gradually instead of kinking at corners
    for (let it = 0; it < 4; it++) {
      const ax = new Float32Array(gx), ay = new Float32Array(gy);
      for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) {
        const k = j * gw + i;
        let sx = 0, sy2 = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const kk = k + dj * gw + di; sx += ax[kk]; sy2 += ay[kk]; }
        const m = Math.hypot(sx, sy2) || 1; gx[k] = sx / m; gy[k] = sy2 / m;
      }
    }
    return (x, y) => {
      const fx = (x - x0) / C, fy = (y - y0) / C, i = Math.max(0, Math.min(gw - 2, Math.floor(fx))), j = Math.max(0, Math.min(gh - 2, Math.floor(fy)));
      const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fy - j));
      const k = j * gw + i;
      const nx = (gx[k] * (1 - u) + gx[k + 1] * u) * (1 - v) + (gx[k + gw] * (1 - u) + gx[k + gw + 1] * u) * v;
      const ny = (gy[k] * (1 - u) + gy[k + 1] * u) * (1 - v) + (gy[k + gw] * (1 - u) + gy[k + gw + 1] * u) * v;
      const a = Math.atan2(ny, nx) / 2;
      return [Math.cos(a), Math.sin(a)];
    };
  }
  function wrapFill(loops, o) {
    const pc = o.pullComp == null ? 0.2 : o.pullComp;
    const rows = flowFill(loops, Object.assign({}, o, { flow: [], __field: wrapField(loops), stitchLen: Math.min(o.stitchLen && o.stitchLen < 7 ? o.stitchLen : 7, 7) }));
    // pull compensation: push both ends of every stitch row a little past the edge
    return rows.map(r => {
      if (r.length < 2 || !pc) return r;
      // only ends that actually reach the outline get pushed out (rows that stop inside stay put)
      const ext = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], d = Math.hypot(dx, dy) || 1; if (pointIn([a[0] + dx / d * 0.5, a[1] + dy / d * 0.5], loops)) return a; return [a[0] + dx / d * pc, a[1] + dy / d * pc]; };
      const out = r.slice(); out[0] = ext(r[0], r[1]); out[out.length - 1] = ext(r[r.length - 1], r[r.length - 2]); return out;
    });
  }
  S.wrapFill = wrapFill;

  // ---------- SAND STITCH: a grainy, hand-sketched texture. Short running stitches wander in
  // random directions over evenly scattered points, giving light coverage that lets the fabric
  // show through. Fade makes it thin out across the shape for soft shading.
  function sandFill(loops, o) {
    const sp = Math.max(0.35, o.sandSpacing || 0.9), maxStep = Math.max(sp * 1.6, o.sandLen || 2.2);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    loops.forEach(l => l.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
    if (!(x1 > x0)) return [];
    // repeatable randomness (same shape -> same stitches every time)
    let seed = 0; loops.forEach(l => l.forEach(q => { seed = (seed * 31 + Math.round(q[0] * 10) * 7 + Math.round(q[1] * 10)) | 0; }));
    let st = (seed ^ 0x9e3779b9) >>> 0 || 1;
    const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
    // fade: spacing grows across the shape in the chosen direction
    const fade = o.sandFade || 0, fa = (o.sandFadeAngle || 0) * Math.PI / 180, fx = Math.cos(fa), fy = Math.sin(fa);
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(c => c[0] * fx + c[1] * fy), pmin = Math.min(...corners), pmax = Math.max(...corners);
    const rAt = (x, y) => fade ? sp * (1 + fade * 3 * Math.max(0, Math.min(1, ((x * fx + y * fy) - pmin) / ((pmax - pmin) || 1)))) : sp;
    // scatter points (dart throwing on a grid) with a gap of about the spacing
    const C = sp / 1.5, gw = Math.ceil((x1 - x0) / C) + 1, gh = Math.ceil((y1 - y0) / C) + 1, grid = new Map(), pts = [];
    const key = (i, j) => i + j * gw;
    const tries = Math.min(400000, Math.ceil((x1 - x0) * (y1 - y0) / (sp * sp) * 6));
    for (let t = 0; t < tries; t++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (!pointIn([x, y], loops)) continue;
      const r = rAt(x, y), gi = Math.floor((x - x0) / C), gj = Math.floor((y - y0) / C), R = Math.ceil(r / C);
      let ok = true;
      for (let dj = -R; dj <= R && ok; dj++) for (let di = -R; di <= R && ok; di++) { const list = grid.get(key(gi + di, gj + dj)); if (list) for (const k of list) { const q = pts[k]; if ((q[0] - x) ** 2 + (q[1] - y) ** 2 < r * r) { ok = false; break; } } }
      if (!ok) continue;
      const k = pts.length; pts.push([x, y]); const kk = key(gi, gj); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(k);
    }
    if (!pts.length) return [];
    // walk: hop to a random nearby unvisited point (not always the nearest -> grainy, crossing look)
    const used = new Uint8Array(pts.length), runs = [];
    const order = pts.map((_, i) => i).sort((a, b) => (pts[a][1] - pts[b][1]) || (pts[a][0] - pts[b][0]));
    let oi = 0;
    const inside = (a, b) => pointIn([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], loops);
    while (true) {
      while (oi < order.length && used[order[oi]]) oi++;
      if (oi >= order.length) break;
      let cur = order[oi]; used[cur] = 1; const run = [pts[cur]];
      for (;;) {
        const p = pts[cur], gi = Math.floor((p[0] - x0) / C), gj = Math.floor((p[1] - y0) / C), R = Math.ceil(maxStep / C);
        const cand = [];
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const list = grid.get(key(gi + di, gj + dj)); if (list) for (const k of list) { if (used[k]) continue; const q = pts[k], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= maxStep && d > 0.2) cand.push([k, d]); } }
        if (!cand.length) {
          // dead end: reach a little further rather than leaving a loose travel thread
          const R2 = Math.ceil(maxStep * 1.8 / C); let bk = -1, bd = Infinity;
          for (let dj = -R2; dj <= R2; dj++) for (let di = -R2; di <= R2; di++) { const list = grid.get(key(gi + di, gj + dj)); if (list) for (const k of list) { if (used[k]) continue; const q = pts[k], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd && d <= maxStep * 1.8) { bd = d; bk = k; } } }
          if (bk >= 0 && inside(p, pts[bk])) { used[bk] = 1; run.push(pts[bk]); cur = bk; continue; }
          break;
        }
        cand.sort((a, b) => a[1] - b[1]);
        let pickK = -1;
        for (let n = 0; n < 4 && pickK < 0; n++) { const c = cand[Math.min(cand.length - 1, Math.floor(rnd() * Math.min(4, cand.length)))]; if (inside(p, pts[c[0]])) pickK = c[0]; else cand.splice(cand.indexOf(c), 1); if (!cand.length) break; }
        if (pickK < 0) break;
        used[pickK] = 1; run.push(pts[pickK]); cur = pickK;
      }
      if (run.length > 1) runs.push(run);
    }
    return runs;
  }
  S.sandFill = sandFill;

  function fillObject(o) {
    const loops = o.paths || [];
    const pieces = [];
    // satin-look layers get an edge-walk underlay so the outline sews crisp
    if (o.satinLook && o.underlay !== false) loops.forEach(l => {
      if (l.length < 3) return;
      let per = 0; for (let i = 0; i < l.length; i++) per += hyp(l[i], l[(i + 1) % l.length]);
      if (per > 2.5) pieces.push({ pts: resamplePolyline(l, 1.5, true), kind: 'underlay' });
    });
    if (o.sand) {
      sandFill(loops, o).forEach(r => pieces.push({ pts: r, kind: 'top' }));
      return orderPieces(pieces);
    }
    if (o.wrap && !(o.flow && o.flow.length)) {
      if (o.underlay !== false && !o.satinLook) tatami(loops, { angle: (o.angle || 0) + 90, spacing: 2.2, stitchLen: 3.0, pullComp: 0, inset: 0.5 }).forEach(r => { if (r.length > 1) pieces.push({ pts: r, kind: 'underlay' }); });
      wrapFill(loops, o).forEach(r => { if (r.length > 1) pieces.push({ pts: r, kind: 'top' }); });
      return orderPieces(pieces);
    }
    if (o.flow && o.flow.length) {
      if (o.underlay !== false) tatami(loops, { angle: 0, spacing: 2.2, stitchLen: 3.0, pullComp: 0, inset: 0.5 }).forEach(r => { if (r.length > 1) pieces.push({ pts: r, kind: 'underlay' }); });
      flowFill(loops, o).forEach(r => { if (r.length > 1) pieces.push({ pts: r, kind: 'top' }); });
      return orderPieces(pieces);
    }
    if (o.underlay !== false) {
      const ul = tatami(loops, { angle: (o.angle || 0) + 90, spacing: 2.0, stitchLen: 3.0, pullComp: 0, inset: 0.5 });
      ul.forEach(r => { if (r.length > 1) pieces.push({ pts: r, kind: 'underlay' }); });
    }
    tatami(loops, { angle: o.angle || 0, spacing: o.spacing || 0.4, stitchLen: o.stitchLen || 3.5, pullComp: o.pullComp == null ? 0.2 : o.pullComp })
      .forEach(r => { if (r.length > 1) pieces.push({ pts: r, kind: 'top' }); });
    return orderPieces(pieces, o.underlay !== false);
  }

  // keep underlay before top, otherwise nearest-neighbour ordering
  function orderPieces(pieces) {
    const groups = [pieces.filter(p => p.kind === 'underlay'), pieces.filter(p => p.kind !== 'underlay')];
    const out = [];
    let cur = null;
    for (const g of groups) {
      const left = g.slice();
      while (left.length) {
        let bi = 0, rev = false, bd = Infinity;
        if (cur) left.forEach((p, i) => {
          const d0 = hyp(cur, p.pts[0]), d1 = hyp(cur, p.pts[p.pts.length - 1]);
          if (d0 < bd) { bd = d0; bi = i; rev = false; }
          if (d1 < bd) { bd = d1; bi = i; rev = true; }
        });
        const p = left.splice(bi, 1)[0];
        const pts = rev ? p.pts.slice().reverse() : p.pts;
        out.push({ pts, kind: p.kind });
        cur = pts[pts.length - 1];
      }
    }
    return out;
  }

  // point–counterpoint satin: taps alternate between the two edges (rails)
  // ---------- STREAMLINE column (point pairs). Every pair the user places is a direction line;
  // between two pairs the stitch angle turns smoothly from one to the next, so corners fan
  // like hand digitizing. Rails are smooth curves through the points. Closed columns loop
  // back to the first pair (rings, the bowl of a letter).
  function catmull(P, closed, sub) {
    // returns per-segment polylines (segment i goes from P[i] to P[i+1])
    const n = P.length, segs = [];
    const get = i => closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
    const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2), seg = [];
      // centripetal-ish tension keeps straight runs straight
      for (let k = 0; k <= sub; k++) {
        const t = k / sub, t2 = t * t, t3 = t2 * t;
        const f = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        seg.push([f(0), f(1)]);
      }
      segs.push(seg);
    }
    return segs;
  }
  function railSatin(o) {
    const P = o.points || [];
    const m = Math.floor(P.length / 2);
    if (m < 2) return [];
    const A = [], B = [];
    for (let i = 0; i < m; i++) { A.push([P[2 * i][0], P[2 * i][1]]); B.push([P[2 * i + 1][0], P[2 * i + 1][1]]); }
    const closed = !!o.closed && m >= 3;
    const curve = o.curve !== false;
    const SA = curve ? catmull(A, closed, 12) : (closed ? A.map((p, i) => [p, A[(i + 1) % m]]) : A.slice(1).map((p, i) => [A[i], p]));
    const SB = curve ? catmull(B, closed, 12) : (closed ? B.map((p, i) => [p, B[(i + 1) % m]]) : B.slice(1).map((p, i) => [B[i], p]));
    const plen = seg => { let L = 0; for (let i = 1; i < seg.length; i++) L += hyp(seg[i - 1], seg[i]); return L; };
    const pt = (seg, L, u) => { let s = u * L; for (let i = 1; i < seg.length; i++) { const d = hyp(seg[i - 1], seg[i]); if (s <= d || i === seg.length - 1) { const f = d ? Math.min(1, s / d) : 0; return [seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * f, seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * f]; } s -= d; } return seg[seg.length - 1]; };
    const sp = Math.max(0.15, o.spacing || 0.4), pc = o.pullComp == null ? 0.15 : o.pullComp;
    const maxW = o.splitAt || 8;
    // cross lines (a -> b) along the whole column, spaced on the longer rail
    const cross = [];   // [a, b, shortSide(0 none, 1 a-side, 2 b-side)]
    for (let i = 0; i < SA.length; i++) {
      const La = plen(SA[i]), Lb = plen(SB[i]), Lm = Math.max(La, Lb, 0.01);
      const k = Math.max(1, Math.round(Lm / (sp / 2)));
      const fan = Math.min(La, Lb) / Lm < 0.6;   // tight turn: inner side gets short stitches
      const inner = La < Lb ? 1 : 2;
      for (let j = (i === 0 ? 0 : 1); j <= k; j++) {
        const u = j / k;
        cross.push([pt(SA[i], La, u), pt(SB[i], Lb, u), fan ? inner : 0]);
      }
    }
    const pieces = [];
    const mid = c => [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
    if (o.underlay !== false && cross.length > 2) {
      // centre walk out, edge zig-zag back: the usual satin underlay
      const cen = []; let acc = Infinity;
      for (let i = 0; i < cross.length; i++) { const q = mid(cross[i]); if (!cen.length || hyp(cen[cen.length - 1], q) >= 2 || i === cross.length - 1) cen.push(q); }
      pieces.push({ pts: cen, kind: 'underlay' });
      const zz = []; let last = null, side = 0;
      for (let i = cross.length - 1; i >= 0; i--) {
        const c = cross[i], q = mid(c);
        if (last && hyp(last, q) < 0.9 && i !== 0) continue;
        const e = side ? c[1] : c[0], f = 0.25;
        zz.push([e[0] + (q[0] - e[0]) * f * 2, e[1] + (q[1] - e[1]) * f * 2]); side ^= 1; last = q;
      }
      pieces.push({ pts: zz, kind: 'underlay' });
    }
    // top satin: zig-zag a, b, a, b ... with pull compensation, short stitches on tight turns,
    // and a split penetration for very wide columns so no thread is left long and loose
    const top = [];
    let shortFlip = 0;
    for (let i = 0; i < cross.length; i++) {
      const [a0, b0, sh] = cross[i];
      const dx = b0[0] - a0[0], dy = b0[1] - a0[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      let a = [a0[0] - ux * pc, a0[1] - uy * pc], b = [b0[0] + ux * pc, b0[1] + uy * pc];
      const toA = i % 2 === 0;           // which edge this penetration lands on
      if (sh && ((toA && sh === 1) || (!toA && sh === 2))) {
        shortFlip ^= 1;
        if (shortFlip) { const f = 0.4; if (toA) a = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; else b = [b[0] + (a[0] - b[0]) * f, b[1] + (a[1] - b[1]) * f]; }
      }
      if (d > maxW && top.length) {
        const f = 0.5 + (i % 4 < 2 ? 0.12 : -0.12);
        top.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
      top.push(toA ? a : b);
    }
    pieces.push({ pts: top, kind: 'top' });
    return pieces;
  }
  // ---------- SATIN BORDER along a shape edge, built as rail pairs (lo side, hi side).
  // Offsets are measured along the outward normal: lo < hi (e.g. lo = -0.3 tucks under the
  // fill, hi = width sits outside). Corners: the side on the outside of the turn fans round
  // (or meets in a sharp miter), the side on the inside of the turn is pinned to one point,
  // so stitches pivot cleanly instead of crossing or shooting out spikes.
  function simplifyPts(pts, tol, closed) {
    if (pts.length < 4) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let bi = -1, bd = tol;
      const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
      for (let i = a + 1; i < b; i++) {
        const P = pts[i]; const d = L < 1e-9 ? hyp(P, A) : Math.abs((P[0] - A[0]) * dy - (P[1] - A[1]) * dx) / L;
        if (d > bd) { bd = d; bi = i; }
      }
      if (bi >= 0) { keep[bi] = 1; st.push([a, bi], [bi, b]); }
    }
    let out = pts.filter((p, i) => keep[i]);
    if (closed && out.length > 3 && hyp(out[0], out[out.length - 1]) < 1e-6) out.pop();
    return out;
  }
  S.simplifyPts = simplifyPts;
  // outward side sign for a loop of a shape (shape = all loops, even-odd)
  S.edgeSide = function (loop, shape) {
    const n = loop.length; let k = 0, best = 0;
    for (let i = 0; i < n; i++) { const d = hyp(loop[i], loop[(i + 1) % n]); if (d > best) { best = d; k = i; } }
    const a = loop[k], b = loop[(k + 1) % n], L = best || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, e = Math.min(0.25, L / 4);
    return pointIn([m[0] + nx * e, m[1] + ny * e], shape) ? -1 : 1;
  };
  // satin across a small narrow shape: one zig-zag per run of single-span rows (few trims)
  function zigFill(loop, angleDeg, sp, pc) {
    const a = angleDeg * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
    const V = loop.map(q => q[0] * v[0] + q[1] * v[1]), U = loop.map(q => q[0] * u[0] + q[1] * u[1]);
    const v0 = Math.min(...V), v1 = Math.max(...V), n = loop.length, chains = [];
    let cur = null, k = 0;
    for (let t = v0 + sp / 2; t < v1; t += sp / 2) {
      const xs = [];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, A = V[i], B = V[j]; if ((A <= t) !== (B <= t)) xs.push(U[i] + (U[j] - U[i]) * (t - A) / (B - A)); }
      xs.sort((p, q) => p - q);
      if (xs.length !== 2 || xs[1] - xs[0] < 0.15) { if (cur && cur.length > 1) chains.push(cur); cur = null; continue; }
      const lo = xs[0] - pc, hi = xs[1] + pc, P = s => [u[0] * s + v[0] * t, u[1] * s + v[1] * t];
      if (!cur) { cur = []; k = 0; }
      cur.push(P(k % 2 ? hi : lo)); k++;
    }
    if (cur && cur.length > 1) chains.push(cur);
    return chains;
  }
  // Traced outlines can double back on themselves for a fraction of a mm (a hairpin spur, or a
  // tiny zig-zag). Each one looks like a 180° corner and makes the satin pivot into a bunch.
  // Drop any vertex where the line reverses (turn > ~135°) over a short distance.
  function despur(L, closed, reach) {
    let P = L.slice(), changed = true, guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      const n = P.length; if (n < (closed ? 4 : 3)) break;
      const keep = new Array(n).fill(true);
      for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
        if (!keep[(i - 1 + n) % n]) continue;
        const a = P[(i - 1 + n) % n], v = P[i], c = P[(i + 1) % n];
        const l1 = hyp(a, v), l2 = hyp(v, c); if (l1 < 1e-6 || l2 < 1e-6) { keep[i] = false; changed = true; continue; }
        const cosT = ((v[0] - a[0]) * (c[0] - v[0]) + (v[1] - a[1]) * (c[1] - v[1])) / (l1 * l2);
        if ((cosT < -0.7 && Math.min(l1, l2) < reach) || (cosT < -0.94 && Math.min(l1, l2) < reach * 3)) { keep[i] = false; changed = true; }
      }
      P = P.filter((p, i) => keep[i]);
    }
    return P;
  }
  // A traced corner usually comes out as 2-3 small bends close together. For mitered (sharp) borders
  // each would get its own miter and they'd overlap, so fold short in-between segments back into one
  // true corner where the neighbouring edges meet.
  function mergeCorners(L, closed, minSeg) {
    let P = L.slice(), changed = true, guard = 0;
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    while (changed && guard++ < 200) {
      changed = false; const n = P.length; if (n < (closed ? 5 : 4)) break;
      for (let i = closed ? 0 : 1; i < (closed ? n : n - 2); i++) {
        const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
        const sl = hyp(b, c); if (sl >= minSeg || sl < 1e-6) continue;
        if (Math.min(hyp(a, b), hyp(c, d)) < Math.max(2 * minSeg, sl * 2.5)) continue;   // on a curve every piece is short: leave curves alone
        if (Math.sign(cross(a, b, c)) !== Math.sign(cross(b, c, d))) continue;   // an S-bend, not one corner
        // intersect line a-b with line c-d
        const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
        if (Math.abs(den) < 1e-9) continue;
        const t2 = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, X = [a[0] + r[0] * t2, a[1] + r[1] * t2];
        const mid = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
        if (hyp(X, mid) > minSeg * 2.5 || t2 < 0.5) continue;
        P[i] = X; P.splice((i + 1) % n, 1); changed = true; break;
      }
    }
    return P;
  }
  // Corner-cutting smoothing that leaves real corners (turn > maxTurn) exactly where they are.
  S.cornerSmooth = function (L, maxTurn, iters) {
    let P = L.slice();
    // straighten tiny Z-jogs (a short piece that turns one way then straight back) — a real patch edge wouldn't follow them
    for (let pass = 0; pass < 3; pass++) {
      const n = P.length; if (n < 6) break; let hit = false;
      for (let i = 0; i < n; i++) {
        const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
        if (hyp(b, c) > 1.4) continue;
        const cr1 = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), cr2 = (c[0] - b[0]) * (d[1] - c[1]) - (c[1] - b[1]) * (d[0] - c[0]);
        if (cr1 * cr2 >= 0) continue;
        const m = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; P[i] = m; P.splice((i + 1) % n, 1); hit = true; break;
      }
      if (!hit) break;
    }
    for (let it = 0; it < (iters || 2); it++) {
      const n = P.length, out = [];
      for (let i = 0; i < n; i++) {
        const a = P[(i - 1 + n) % n], v = P[i], c = P[(i + 1) % n];
        const d1 = [v[0] - a[0], v[1] - a[1]], d2 = [c[0] - v[0], c[1] - v[1]], l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
        const turn = l1 && l2 ? Math.acos(Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2)))) : 0;
        if (turn > maxTurn) { out.push(v); continue; }
        const k1 = Math.min(0.25, 4 / Math.max(l1, 1e-6)), k2 = Math.min(0.25, 4 / Math.max(l2, 1e-6));   // cut at most 4 mm per side
        out.push([v[0] - d1[0] * k1, v[1] - d1[1] * k1], [v[0] + d2[0] * k2, v[1] + d2[1] * k2]);
      }
      P = out;
    }
    return P;
  };
  S.zigFill = (l, a, sp, pc) => zigFill(l, a, sp, pc);
  S.despur = despur;
  S.edgePairs = function (loop0, o) {
    const closed = !o.open, side = o.side || 1;
    const lo = o.lo, hi = o.hi, corners = o.corners || 'round';
    // clean: drop near-duplicates, straighten pixel staircase, keep real corners
    let L = [];
    loop0.forEach(p => { if (!L.length || hyp(L[L.length - 1], p) > 0.08) L.push([p[0], p[1]]); });
    if (closed && L.length > 2 && hyp(L[0], L[L.length - 1]) < 0.08) L.pop();
    L = closed ? simplifyPts(L.concat([L[0]]), o.tol || 0.09, true) : simplifyPts(L, o.tol || 0.09, false);
    L = despur(L, closed, Math.max(1.2, Math.min(4, Math.max(Math.abs(o.lo), Math.abs(o.hi)))));
    if (corners === 'sharp') L = mergeCorners(L, closed, Math.max(0.6, (o.hi - o.lo) * 0.75));
    const n = L.length;
    if (n < (closed ? 3 : 2)) return [];
    const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; };
    const nrmOf = d => [-d[1] * side, d[0] * side];
    const P = (v, nn, h) => [v[0] + nn[0] * h, v[1] + nn[1] * h];
    const pairs = [];
    const push = (a, b) => pairs.push([a, b]);
    const segLen = i => hyp(L[i], L[(i + 1) % n]);
    for (let i = 0; i < n; i++) {
      const v = L[i];
      if (!closed && (i === 0 || i === n - 1)) {
        const d = i === 0 ? unit(L[0], L[1]) : unit(L[n - 2], L[n - 1]), nn = nrmOf(d);
        push(P(v, nn, lo), P(v, nn, hi)); continue;
      }
      const vp = L[(i - 1 + n) % n], vn = L[(i + 1) % n];
      const d1 = unit(vp, v), d2 = unit(v, vn), n1 = nrmOf(d1), n2 = nrmOf(d2);
      const th = Math.atan2(n1[0] * n2[1] - n1[1] * n2[0], n1[0] * n2[0] + n1[1] * n2[1]);   // normal rotation
      let nb = [n1[0] + n2[0], n1[1] + n2[1]]; const nbl = Math.hypot(nb[0], nb[1]);
      nb = nbl < 1e-6 ? n1 : [nb[0] / nbl, nb[1] / nbl];
      const cosH = Math.max(0.2, Math.cos(th / 2));
      if (Math.abs(th) < 0.42) { push(P(v, nb, lo / cosH), P(v, nb, hi / cosH)); continue; }
      // SHARP = a real mitered corner: stitches stay square to each side and meet along the
      // corner's diagonal (no fan, no pinch). Very acute corners fall back to a pivot.
      if (corners === 'sharp' && Math.abs(th) > 0.6 && Math.cos(th / 2) > 0.12) {
        let g = [d1[0] + d2[0], d1[1] + d2[1]]; const gl = Math.hypot(g[0], g[1]);
        if (gl > 1e-3) {
          g = [g[0] / gl, g[1] / gl];
          const room1 = segLen((i - 1 + n) % n) * 0.45, room2 = segLen(i) * 0.45;
          const Fm = Math.max(Math.abs(lo), Math.abs(hi)) * 1.2 / Math.max(0.12, Math.cos(th / 2)) + 0.3, st = 0.3;
          const clip = (F, nn, sgn) => {   // stitch F + nn*u, keep the part with sgn*dot(X - v, g) <= 0
            const a0 = sgn * ((F[0] - v[0]) * g[0] + (F[1] - v[1]) * g[1]), b0 = sgn * (nn[0] * g[0] + nn[1] * g[1]);
            let u0 = lo, u1 = hi;
            if (b0 > 1e-9) u1 = Math.min(u1, -a0 / b0); else if (b0 < -1e-9) u0 = Math.max(u0, -a0 / b0); else if (a0 > 0) return null;
            // miter limit: an over-long tip (very sharp corner) is cut square across, 2x the width out
            const lim = (h, sg) => { const cap = Math.abs(h) * 2.0, e = [nb[0] * sg, nb[1] * sg], c0 = (F[0] - v[0]) * e[0] + (F[1] - v[1]) * e[1], c1 = nn[0] * e[0] + nn[1] * e[1];
              if (c1 > 1e-9) u1 = Math.min(u1, (cap - c0) / c1); else if (c1 < -1e-9) u0 = Math.max(u0, (cap - c0) / c1); };
            if (Math.abs(hi) > 0.5) lim(hi, Math.sign(hi)); if (Math.abs(lo) > 0.5) lim(lo, Math.sign(lo));
            if (u1 - u0 < 0.25) return null;
            const pr = [P(F, nn, u0), P(F, nn, u1)]; pr.m = true; return pr;
          };
          for (let f = Math.min(room1, Fm); f >= -Fm; f -= st) { const pr = clip([v[0] - d1[0] * f, v[1] - d1[1] * f], n1, 1); if (pr) pairs.push(pr); }
          for (let f = -Fm; f <= Math.min(room2, Fm); f += st) { const pr = clip([v[0] + d2[0] * f, v[1] + d2[1] * f], n2, -1); if (pr) pairs.push(pr); }
          continue;
        }
      }
      // which side is on the outside of this turn? cross(d1,d2) vs side
      const cr = d1[0] * d2[1] - d1[1] * d2[0];
      const hiOut = cr * side < 0;                  // the +normal side is convex here
      const hOut = hiOut ? hi : lo, hIn = hiOut ? lo : hi;   // fan side, pinned side
      const room = Math.min(segLen((i - 1 + n) % n), segLen(i)) * 0.45;
      const dl = Math.min(room, Math.abs(hIn) * Math.tan(Math.min(Math.abs(th), 2.6) / 2));
      const pin = P(v, nb, hIn / Math.max(cosH, 0.45));
      const mk = (pinPt, outPt) => hiOut ? push(pinPt, outPt) : push(outPt, pinPt);
      // approach: perpendicular to the incoming edge, its pinned end already at the miter point
      const va = [v[0] - d1[0] * dl, v[1] - d1[1] * dl], vl = [v[0] + d2[0] * dl, v[1] + d2[1] * dl];
      mk(dl > 0.05 ? pin : P(va, n1, hIn), P(va, n1, hOut));
      const miterK = 1 / Math.cos(th / 2);
      if (corners === 'sharp' && Math.abs(miterK) < 2.8) {
        mk(pin, P(v, n1, hOut)); mk(pin, P(v, nb, hOut * Math.abs(miterK))); mk(pin, P(v, n2, hOut));
      } else {
        const K = Math.max(2, Math.ceil(Math.abs(th) / 0.3));
        for (let k = 0; k <= K; k++) {
          const t = th * k / K, c = Math.cos(t), sn = Math.sin(t);
          mk(pin, P(v, [n1[0] * c - n1[1] * sn, n1[0] * sn + n1[1] * c], hOut));
        }
      }
      mk(dl > 0.05 ? pin : P(vl, n2, hIn), P(vl, n2, hOut));
    }
    // straight runs: extra pairs so the stitch angle stays square to the edge between corners
    const out0 = [];
    for (let i = 0; i < pairs.length; i++) {
      out0.push(pairs[i]);
      if (!closed && i === pairs.length - 1) break;
      const p = pairs[i], q = pairs[(i + 1) % pairs.length];
      const ma = hyp(p[0], q[0]), mb = hyp(p[1], q[1]), m = Math.max(ma, mb);
      const steps = Math.floor(m / 2.5);
      for (let s2 = 1; s2 < steps; s2++) {
        const t = s2 / steps;
        out0.push([[p[0][0] + (q[0][0] - p[0][0]) * t, p[0][1] + (q[0][1] - p[0][1]) * t], [p[1][0] + (q[1][0] - p[1][0]) * t, p[1][1] + (q[1][1] - p[1][1]) * t]]);
      }
    }
    return unfold(out0, L, closed, lo, hi);
  };
  // Where the edge curves tighter than the border is wide, the far side of the satin would fold
  // back over itself (stitches cross and bunch). Any point that lands closer to the edge than it
  // should be is in such a fold: pin the whole fold to one point so the stitches fan cleanly.
  function unfold(pairs, L, closed, lo, hi) {
    const n = L.length, segs = []; for (let i = 0; i < (closed ? n : n - 1); i++) segs.push([L[i], L[(i + 1) % n]]);
    const C = 2, grid = new Map(), key = (x, y) => x + ',' + y;
    segs.forEach((s, si) => { const x0 = Math.floor(Math.min(s[0][0], s[1][0]) / C), x1 = Math.floor(Math.max(s[0][0], s[1][0]) / C), y0 = Math.floor(Math.min(s[0][1], s[1][1]) / C), y1 = Math.floor(Math.max(s[0][1], s[1][1]) / C);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(si); } });
    const dist = (p, R) => { let best = Infinity; const r = Math.ceil(R / C) + 1, cx = Math.floor(p[0] / C), cy = Math.floor(p[1] / C), seen = new Set();
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) (grid.get(key(x, y)) || []).forEach(si => { if (seen.has(si)) return; seen.add(si); const [a, b] = segs[si], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; best = Math.min(best, Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1])); });
      return best; };
    const m = pairs.length;
    [[0, lo], [1, hi]].forEach(([side, h]) => {
      const H = Math.abs(h); if (H < 0.6 || m < 3) return;
      const bad = pairs.map(pr => !pr.m && dist(pr[side], H) < H * 0.8);   // mitered corners sit closer on purpose
      if (!bad.some(x => x) || bad.every(x => x)) return;
      // walk runs of bad points (wrapping for closed loops), pin each run
      const start = closed ? bad.findIndex((x, i) => !x && bad[(i + 1) % m]) : -1;
      const visit = closed ? Array.from({ length: m }, (_, k) => (start + 1 + k) % m) : Array.from({ length: m }, (_, k) => k);
      let run = [];
      const flush = (after) => {
        if (!run.length) return;
        const bi = (run[0] - 1 + m) % m, ai = after;
        const pb = (closed || run[0] > 0) ? pairs[bi][side] : null, pa = ai != null ? pairs[ai][side] : null;
        const pin = pb && pa ? [(pb[0] + pa[0]) / 2, (pb[1] + pa[1]) / 2] : (pb || pa);
        if (pin) run.forEach(i => { pairs[i][side] = [pin[0], pin[1]]; });
        run = [];
      };
      visit.forEach(i => { if (bad[i]) run.push(i); else flush(i); });
      flush(closed ? (start + 1) % m : null);
    });
    return pairs;
  }
  // pairs -> satin pieces (rail satin, straight between pairs)
  S.edgeSatin = function (loop, o) {
    const pr = S.edgePairs(loop, o);
    if (pr.length < 2) return [];
    const pts = []; pr.forEach(([a, b]) => { pts.push([a[0], a[1]], [b[0], b[1]]); });
    return railSatin({ points: pts, closed: !o.open, curve: false, spacing: o.spacing || 0.36, pullComp: o.pullComp == null ? 0.12 : o.pullComp, underlay: o.underlay, splitAt: 9 });
  };
  S.streamRails = (o) => {
    const P = o.points || [], m = Math.floor(P.length / 2); if (m < 2) return null;
    const A = [], B = []; for (let i = 0; i < m; i++) { A.push([P[2 * i][0], P[2 * i][1]]); B.push([P[2 * i + 1][0], P[2 * i + 1][1]]); }
    const closed = !!o.closed && m >= 3;
    const flat = segs => segs.reduce((acc, s, i) => acc.concat(i ? s.slice(1) : s), []);
    return { A: o.curve === false ? A : flat(catmull(A, closed, 12)), B: o.curve === false ? B : flat(catmull(B, closed, 12)), closed };
  };

  function satinObject(o) {
    if (o.mode === 'rails') return railSatin(o);
    const raw = (o.points || []).map(p => [p[0], p[1], p[2] == null ? (o.width || 3) : p[2]]);
    if (raw.length < 2) return [];
    const sm = raw.length >= 3 ? smooth(raw, false, 10) : raw;
    // arc length param
    const cum = [0];
    for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + hyp(sm[i - 1], sm[i]));
    const total = cum[cum.length - 1];
    if (total < 0.3) return [];
    const at = t => {
      let i = 1; while (i < cum.length - 1 && cum[i] < t) i++;
      const a = sm[i - 1], b = sm[i], d = (cum[i] - cum[i - 1]) || 1, f = Math.max(0, Math.min(1, (t - cum[i - 1]) / d));
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    };
    const nrm = t => {
      const e = Math.min(o.nwin || 0.6, total / 4);
      const p = at(Math.max(0, t - e)), q = at(Math.min(total, t + e));
      const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
      return [-dy / d, dx / d];
    };
    const pc = o.pullComp == null ? 0.15 : o.pullComp, sp = Math.max(0.15, o.spacing || 0.4);
    const pieces = [];
    const zig = (step, wscale, extra, reverse) => {
      const pts = [];
      const n = Math.max(2, Math.round(total / step));
      for (let i = 0; i <= n; i++) {
        const t = (reverse ? (n - i) : i) / n * total;
        const p = at(t), N = nrm(t), hw = Math.max(0.2, p[2] / 2 * wscale + extra);
        const side = i % 2 ? -1 : 1;
        // short stitches: on the inside of a tight turn, every other stitch stops part-way
        // so the satin doesn't bunch into a starburst
        let len = hw;
        const e = Math.max(0.5, hw * 1.2), a0 = nrm(Math.max(0, t - e)), a1 = nrm(Math.min(total, t + e));
        const turn = a0[0] * a1[1] - a0[1] * a1[0];          // signed sine of the turn
        if (Math.abs(turn) > 0.25 && Math.sign(turn) === side && (i >> 1) % 2 === 1) len = hw * Math.max(0.35, 1 - Math.abs(turn) * 0.9);
        pts.push([p[0] + N[0] * len * side, p[1] + N[1] * len * side]);
      }
      return pts;
    };
    if (o.underlay !== false) {
      const cen = [];
      const n = Math.max(1, Math.round(total / 2.0));
      for (let i = 0; i <= n; i++) { const p = at(i / n * total); cen.push([p[0], p[1]]); }
      pieces.push({ pts: cen, kind: 'underlay' });
      const avgW = raw.reduce((a, p) => a + p[2], 0) / raw.length;
      if (avgW > 1.6) pieces.push({ pts: zig(1.8, 0.75, 0, true), kind: 'underlay' });
      else pieces.push({ pts: cen.slice().reverse(), kind: 'underlay' });
    }
    pieces.push({ pts: zig(sp / 2, 1, pc, false), kind: 'top' });
    return pieces;
  }

  function runObject(o) {
    let pts = (o.points || []).map(p => [p[0], p[1]]);
    if (pts.length < 2) return [];
    if (o.curve !== false && pts.length >= 3) pts = smooth(pts, !!o.closed, 8).map(p => [p[0], p[1]]);
    const R = resamplePolyline(pts, Math.max(0.5, o.stitchLen || 2.5), !!o.closed);
    const passes = o.passes || 1;
    if (passes === 1) return [{ pts: R, kind: 'top' }];
    const out = [R[0]];
    for (let i = 1; i < R.length; i++) {
      out.push(R[i]);
      for (let p = 1; p < passes; p++) out.push(p % 2 ? R[i - 1] : R[i]);
    }
    return [{ pts: out, kind: 'top' }];
  }

  S.objectPieces = function (o) {
    if (o.hidden) return [];
    if (o.type === 'fill') return fillObject(o);
    if (o.type === 'satin') return satinObject(o);
    if (o.type === 'run') return runObject(o);
    if (o.type === 'border') {
      // satin border along each edge loop of the (merged) letter outline
      const shape = (o.loops || []).filter(l => l.length >= 3);
      if (!o.v2) {   // old files: loops are centre lines
        const out = [];
        shape.forEach(l => {
          let ar = 0, per = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; ar += p[0] * q[1] - q[0] * p[1]; per += hyp(p, q); }
          if (2 * Math.abs(ar) / 2 / Math.max(per, 1e-6) < o.width * 1.35) return;
          satinObject({ points: l.concat([l[0], l[1]]).map(q => [q[0], q[1], o.width]), spacing: o.spacing || 0.38, underlay: o.underlay, pullComp: 0.12, nwin: 0.3 }).forEach(pc => out.push(pc));
        });
        return orderPieces(out);
      }
      // closed-up gaps between letter parts: satin across them, sewn during the border's
      // underlay walk (the walk runs where the border will cover it, so no trims)
      const chains = [];
      (o.fills || []).filter(l => l.length >= 3).forEach(l => {
        let mx = 0, my = 0; l.forEach(q => { mx += q[0]; my += q[1]; }); mx /= l.length; my /= l.length;
        let sxx = 0, syy = 0, sxy = 0; l.forEach(q => { const dx = q[0] - mx, dy = q[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
        const ax = 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
        zigFill(l, ax + 90, 0.34, 0.12).forEach(r => { if (r.length > 1) chains.push(r); });
      });
      const rings = [], solo = [];
      shape.forEach((l, li) => {
        let ar = 0, per = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; ar += p[0] * q[1] - q[0] * p[1]; per += hyp(p, q); }
        ar = Math.abs(ar) / 2;
        const isHole = !!(o.holeFlags && o.holeFlags[li]);
        if (isHole && 2 * ar / Math.max(per, 1e-6) < o.width * 1.15) {
          tatami([l], { angle: 45, spacing: 0.4, stitchLen: 2.5, pullComp: 0.1 }).forEach(r => { if (r.length > 1) solo.push({ pts: r, kind: 'top' }); });
          return;
        }
        const pcs = S.edgeSatin(l, { side: S.edgeSide(l, shape), lo: o.lo == null ? -0.3 : o.lo, hi: o.width, corners: o.corners, spacing: o.spacing || 0.36, underlay: o.underlay !== false, pullComp: 0.1 });
        if (pcs.length) rings.push(pcs);
      });
      // hand each gap fill to the nearest ring's centre walk
      const walkOf = r => r.find(p => p.kind === 'underlay');
      const ins = rings.map(() => []);
      chains.forEach(c => {
        let best = null, bd = Infinity;
        rings.forEach((r, ri) => { const w = walkOf(r) || r[r.length - 1]; w.pts.forEach((q, qi) => { const d = Math.min(hyp(q, c[0]), hyp(q, c[c.length - 1])); if (d < bd) { bd = d; best = [ri, qi]; } }); });
        if (!best || bd > o.width + 1.2) { solo.push({ pts: c, kind: 'top' }); return; }
        const q = (walkOf(rings[best[0]]) || rings[best[0]][0]).pts[best[1]];
        ins[best[0]].push({ qi: best[1], c: hyp(q, c[0]) <= hyp(q, c[c.length - 1]) ? c : c.slice().reverse() });
      });
      const out = [];
      rings.forEach((r, ri) => {
        const w = walkOf(r);
        if (!w || !ins[ri].length) { ins[ri].forEach(x => out.push({ pts: x.c, kind: 'top' })); r.forEach(p => out.push(p)); return; }
        const list = ins[ri].sort((a, b) => a.qi - b.qi);
        let from = 0;
        list.forEach(x => {
          const seg = w.pts.slice(from, x.qi + 1); if (seg.length > 1) out.push({ pts: seg, kind: 'underlay' });
          out.push({ pts: x.c, kind: 'top' });
          const end = x.c[x.c.length - 1], reach = o.width + 1.2;
          let j = x.qi, bj = hyp(end, w.pts[x.qi]);
          for (let k = x.qi; k < w.pts.length; k++) { const d = hyp(end, w.pts[k]); if (d < bj) { bj = d; j = k; } }
          if (bj <= reach) out.push({ pts: [end, w.pts[j]], kind: 'underlay' });   // short hop back onto the walk
          from = bj <= reach ? j : x.qi;
        });
        const rest = w.pts.slice(from); if (rest.length > 1) out.push({ pts: rest, kind: 'underlay' });
        r.forEach(p => { if (p !== w) out.push(p); });
      });
      return orderPieces(solo).concat(out);
    }
    if (o.type === 'import') return (o.blocks || []).flatMap(bl => bl.lines.filter(l => l.length > 1).map(l => ({ pts: l, kind: 'top' })));
    if (o.type === 'stitches') return (o.lines || []).filter(l => l.length > 1).map(l => ({ pts: l, kind: 'top' }));
    if (o.type === 'text' && o.glyphs) {
      // glyphs are pre-traced fill shapes (see app text tool); each sewn as satin-look fill
      const pieces = [];
      o.glyphs.forEach(g => {
        const go = { paths: g.paths, angle: g.angle, spacing: o.spacing || 0.38, stitchLen: o.style === 'fill' ? 3.0 : 12.0, pullComp: o.pullComp == null ? 0.12 : o.pullComp, underlay: false };
        const top = tatami(go.paths, go);
        // edge-run underlay so letters stay crisp
        if (o.underlay !== false) g.paths.forEach(l => { if (l.length > 2) pieces.push({ pts: resamplePolyline(l, 1.2, true), kind: 'underlay', glyph: g }); });
        top.forEach(r => { if (r.length > 1) pieces.push({ pts: r, kind: 'top', glyph: g }); });
      });
      // sew glyph by glyph: underlay then top for each
      const out = []; let cur = null;
      const byGlyph = new Map();
      pieces.forEach(p => { if (!byGlyph.has(p.glyph)) byGlyph.set(p.glyph, []); byGlyph.get(p.glyph).push(p); });
      for (const list of byGlyph.values()) {
        const ordered = orderPieces(list.map(p => ({ pts: p.pts, kind: p.kind })));
        if (cur && ordered.length) { /* keep */ }
        ordered.forEach(p => out.push(p));
        if (ordered.length) cur = ordered[ordered.length - 1].pts.slice(-1)[0];
      }
      return out;
    }
    return [];
  };

  // ---------- assemble the whole design: ties, trims, colour changes
  // returns {stitches:[{x,y,c}], colors:[hex], ...} c: 0 stitch, 1 jump, 2 trim, 3 color change, 4 end
  const MASKS = new WeakMap();   // shape coverage grids, reused while a shape is unchanged
  S.build = function (objects, opt) {
    opt = opt || {};
    const st = [];
    const colors = [];
    let pos = null, curColor = null, needTie = true;
    const STITCH = 0, JUMP = 1, TRIM = 2, COLOR = 3;
    const tieOff = () => {
      if (!pos || needTie) return;
      const [x, y] = pos;
      st.push({ x: x + 0.3, y, c: STITCH }, { x, y, c: STITCH }, { x: x + 0.3, y, c: STITCH }, { x, y, c: STITCH });
    };
    const trim = () => { if (pos && !needTie) { tieOff(); st.push({ x: pos[0], y: pos[1], c: TRIM }); } needTie = true; };
    const stitchTo = (p) => {
      if (needTie) {
        st.push({ x: p[0], y: p[1], c: JUMP });
        st.push({ x: p[0] + 0.3, y: p[1], c: STITCH }, { x: p[0], y: p[1], c: STITCH }, { x: p[0] + 0.3, y: p[1], c: STITCH }, { x: p[0], y: p[1], c: STITCH });
        needTie = false; pos = p; return;
      }
      const d = hyp(pos, p);
      if (d < 0.05) return;
      const n = Math.ceil(d / 10.0);  // never leave a stitch longer than 10 mm
      for (let i = 1; i <= n; i++) st.push({ x: pos[0] + (p[0] - pos[0]) * i / n, y: pos[1] + (p[1] - pos[1]) * i / n, c: STITCH });
      pos = p;
    };
    // ---- coverage masks: which areas get stitched over by a shape sewn later.
    // Used to (1) only let connecting threads run where they'll be buried, otherwise trim,
    // (2) drop stitching that a later layer completely covers ("remove hidden stitches"),
    // (3) break any stitch of a fill that strays outside its own shape.
    const CELL = 0.2, EDGE = 0.4, UNDERLAP = opt.underlap == null ? 0.5 : opt.underlap;
    const maskOf = o => {
      if (o.hidden) return null;
      let loops = null;
      if (o.type === 'fill' && o.paths) loops = o.paths;
      else if (o.type === 'text' && o.glyphs) loops = o.glyphs.flatMap(g => g.paths || []);
      if (!loops || !loops.length) return null;
      const keyObj = o.type === 'fill' ? o.paths : o.glyphs;
      // geometry fingerprint: shapes are edited in place (move, resize, drag points), so check it still matches
      let fp = 0, np = 0; loops.forEach(l => { np += l.length; for (let i = 0; i < l.length; i += Math.max(1, l.length >> 3)) fp = (fp * 31 + Math.round(l[i][0] * 100) * 7 + Math.round(l[i][1] * 100)) | 0; });
      fp = fp + ':' + np;
      const hit = MASKS.get(keyObj); if (hit && hit.ul === UNDERLAP && hit.fp === fp) return hit;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      loops.forEach(l => l.forEach(q => { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }));
      const pad = 1.0; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const w = Math.max(1, Math.ceil((x1 - x0) / CELL)), h = Math.max(1, Math.ceil((y1 - y0) / CELL));
      if (w * h > 6e6) return null;
      const m = new Uint8Array(w * h);
      const edges = [];
      loops.forEach(l => { for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a, b] : [b, a]); } });
      edges.sort((u, v) => u[0][1] - v[0][1]);
      for (let r = 0; r < h; r++) {
        const y = y0 + (r + 0.5) * CELL, xs = [];
        for (const [a, b] of edges) { if (a[1] > y) break; if (y < b[1]) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])); }
        xs.sort((u, v) => u - v);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const c0 = Math.max(0, Math.ceil((xs[i] - x0) / CELL - 0.5)), c1 = Math.min(w - 1, Math.floor((xs[i + 1] - x0) / CELL - 0.5));
          for (let c = c0; c <= c1; c++) m[r * w + c] = 1;
        }
      }
      // square-ish morphology via separable passes
      const morph = (src, k, grow) => {
        if (k <= 0) return src;
        const t = new Uint8Array(w * h), out = new Uint8Array(w * h);
        for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
          let v = grow ? 0 : 1;
          for (let d = -k; d <= k; d++) { const cc = c + d; const s2 = cc < 0 || cc >= w ? 0 : src[r * w + cc]; if (grow ? s2 : !s2) { v = grow ? 1 : 0; break; } }
          t[r * w + c] = v;
        }
        for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) {
          let v = grow ? 0 : 1;
          for (let d = -k; d <= k; d++) { const rr = r + d; const s2 = rr < 0 || rr >= h ? 0 : t[rr * w + c]; if (grow ? s2 : !s2) { v = grow ? 1 : 0; break; } }
          out[r * w + c] = v;
        }
        return out;
      };
      const res = { x0, y0, w, h, ul: UNDERLAP, near: morph(m, Math.round(EDGE / CELL), true), deep: morph(m, Math.round(UNDERLAP / CELL), false) };
      res.fp = fp; MASKS.set(keyObj, res);
      return res;
    };
    const look = (mk, p, which) => {
      if (!mk) return false;
      const c = Math.floor((p[0] - mk.x0) / CELL), r = Math.floor((p[1] - mk.y0) / CELL);
      if (c < 0 || r < 0 || c >= mk.w || r >= mk.h) return false;
      return mk[which][r * mk.w + c] === 1;
    };
    const masks = objects.map(maskOf);
    const knockout = opt.knockout !== false;
    const hopMax = opt.hopMax == null ? 0.8 : opt.hopMax;   // tiny hops are invisible: sew straight across
    const laterHas = (oi, p, which) => { for (let j = oi + 1; j < masks.length; j++) if (look(masks[j], p, which)) return true; return false; };
    const samples = (a, b, step) => { const d = hyp(a, b), n = Math.max(1, Math.ceil(d / step)), out = []; for (let i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return out; };
    let objIndexStart = [];
    let oi = -1, removed = 0;
    for (const o of objects) {
      oi++;
      let pieces = S.objectPieces(o);
      if (!pieces.length) continue;
      const own = masks[oi], shaped = !!own;
      // a connecting line is buried if it stays inside this shape or under a shape sewn later
      // once this shape's top stitches have started, a travel thread across it would lie ON TOP of them,
      // so only a later layer can hide it then (short hops under 2.5 mm stay, they sink into the fill)
      let topSewn = false;
      const hidden = (a, b) => samples(a, b, 0.3).every((q, i, arr) => i === 0 || i === arr.length - 1 || (!topSewn && look(own, q, 'near')) || laterHas(oi, q, 'near'));
      // split pieces: drop stitches a later layer completely covers; break stitches that stray outside the shape
      if (knockout || shaped) {
        const out = [];
        for (const pc of pieces) {
          let run = [pc.pts[0]];
          for (let i = 1; i < pc.pts.length; i++) {
            const a = pc.pts[i - 1], b = pc.pts[i];
            const sm = samples(a, b, 0.3);
            let drop = false;
            if (knockout && sm.every(q => laterHas(oi, q, 'deep'))) { drop = true; removed++; }
            else if (shaped && hyp(a, b) > 1.0 && !hidden(a, b)) drop = true;   // would lie loose across the fabric
            if (drop) { if (run.length > 1) out.push({ pts: run, kind: pc.kind }); run = [b]; }
            else run.push(b);
          }
          if (run.length > 1) out.push({ pts: run, kind: pc.kind });
        }
        // if anything was cut out, re-order the fragments so we sew nearby ones together
        pieces = out.length !== pieces.length ? orderPieces(out) : out;
        if (!pieces.length) continue;
      }
      const col = (o.color || '#000000').toLowerCase();
      if (curColor !== col || o.stopBefore) {   // stopBefore: machine pauses (applique fabric placement)
        if (curColor !== null) { trim(); st.push({ x: pos ? pos[0] : 0, y: pos ? pos[1] : 0, c: COLOR }); }
        curColor = col; colors.push({ color: col, name: o.threadName || '' });
      }
      objIndexStart.push({ id: o.id, at: st.length });
      for (const pc of pieces) {
        const first = pc.pts[0];
        if (pos && !needTie) {
          const d = hyp(pos, first);
          if (d > hopMax) {
            // travel with a running stitch only where it will be buried; otherwise trim so no
            // stray thread is left lying across the fabric or across other colours
            if (d < (o.sand ? 3 : 40) && ((d <= 2.5 && samples(pos, first, 0.3).every(q => look(own, q, 'deep') || laterHas(oi, q, 'near'))) || hidden(pos, first))) { const n = Math.ceil(d / (d < 12 ? 2.0 : 3.0)); const a0 = pos.slice(); for (let i = 1; i < n; i++) stitchTo([a0[0] + (first[0] - a0[0]) * i / n, a0[1] + (first[1] - a0[1]) * i / n]); }
            else trim();
          }
        }
        for (const p of pc.pts) stitchTo(p);
        if (pc.kind !== 'underlay') topSewn = true;
      }
      trim();
    }
    st.push({ x: pos ? pos[0] : 0, y: pos ? pos[1] : 0, c: 4 });
    let n = 0, trims = 0, minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    st.forEach(s => { if (s.c === 0) { n++; if (s.x < minx) minx = s.x; if (s.y < miny) miny = s.y; if (s.x > maxx) maxx = s.x; if (s.y > maxy) maxy = s.y; } if (s.c === 2) trims++; });
    return { stitches: st, colors, count: n, trims, removed, bounds: n ? [minx, miny, maxx, maxy] : [0, 0, 0, 0], objIndexStart };
  };

  // ---------- writers. Convert to 0.1 mm integer units centred on the design.
  function toUnits(design) {
    const b = design.bounds, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return design.stitches.map(s => ({ x: Math.round((s.x - cx) * 10), y: Math.round((s.y - cy) * 10), c: s.c }));
  }
  function boundsU(U) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    U.forEach(s => { if (s.c === 0 || s.c === 1) { a = Math.min(a, s.x); b = Math.min(b, s.y); c = Math.max(c, s.x); d = Math.max(d, s.y); } });
    if (a === Infinity) return [0, 0, 0, 0];
    return [a, b, c, d];
  }
  class Buf {
    constructor() { this.a = []; }
    u8(v) { this.a.push(v & 255); }
    i8(v) { this.a.push(v & 255); }
    u16be(v) { this.u8(v >> 8); this.u8(v); }
    u24be(v) { this.u8(v >> 16); this.u8(v >> 8); this.u8(v); }
    i32be(v) { v = v | 0; this.u8(v >>> 24); this.u8(v >>> 16); this.u8(v >>> 8); this.u8(v); }
    bytes(arr) { for (const b of arr) this.u8(b); }
    ascii(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
    utf8(s) { this.bytes(new TextEncoder().encode(s)); }
    utf16be(s) { for (let i = 0; i < s.length; i++) this.u16be(s.charCodeAt(i)); }
    get pos() { return this.a.length; }
    patch32(at, v) { v = v | 0; this.a[at] = (v >>> 24) & 255; this.a[at + 1] = (v >>> 16) & 255; this.a[at + 2] = (v >>> 8) & 255; this.a[at + 3] = v & 255; }
    out() { return new Uint8Array(this.a); }
  }

  // DST ---------------------------------------------------------------
  function dstRecord(x, y, kind) {
    y = -y;
    let b0 = 0, b1 = 0, b2 = 0;
    const bit = n => 1 << n;
    if (kind === 'jump') b2 |= bit(7);
    if (kind === 'stitch' || kind === 'jump') {
      b2 |= bit(0) | bit(1);
      if (x > 40) { b2 |= bit(2); x -= 81; } if (x < -40) { b2 |= bit(3); x += 81; }
      if (x > 13) { b1 |= bit(2); x -= 27; } if (x < -13) { b1 |= bit(3); x += 27; }
      if (x > 4) { b0 |= bit(2); x -= 9; } if (x < -4) { b0 |= bit(3); x += 9; }
      if (x > 1) { b1 |= bit(0); x -= 3; } if (x < -1) { b1 |= bit(1); x += 3; }
      if (x > 0) { b0 |= bit(0); x -= 1; } if (x < 0) { b0 |= bit(1); x += 1; }
      if (y > 40) { b2 |= bit(5); y -= 81; } if (y < -40) { b2 |= bit(4); y += 81; }
      if (y > 13) { b1 |= bit(5); y -= 27; } if (y < -13) { b1 |= bit(4); y += 27; }
      if (y > 4) { b0 |= bit(5); y -= 9; } if (y < -4) { b0 |= bit(4); y += 9; }
      if (y > 1) { b1 |= bit(7); y -= 3; } if (y < -1) { b1 |= bit(6); y += 3; }
      if (y > 0) { b0 |= bit(7); y -= 1; } if (y < 0) { b0 |= bit(6); y += 1; }
      if (x !== 0 || y !== 0) throw new Error('DST delta out of range');
    } else if (kind === 'color') b2 = 0b11000011;
    else if (kind === 'end') b2 = 0b11110011;
    return [b0, b1, b2];
  }
  S.writeDST = function (design, name) {
    const U = toUnits(design);
    const recs = [];
    let px = 0, py = 0, count = 0, colorCount = 0;
    const moveIn = (x, y, kind) => {
      let dx = x - px, dy = y - py;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 121));
      for (let i = 1; i <= n; i++) {
        const tx = px + Math.round(dx * i / n) - (px + Math.round(dx * (i - 1) / n));
        const ty = py + Math.round(dy * i / n) - (py + Math.round(dy * (i - 1) / n));
        recs.push(dstRecord(tx, ty, kind)); count++;
      }
      px = x; py = y;
    };
    for (const s of U) {
      if (s.c === 0) moveIn(s.x, s.y, 'stitch');
      else if (s.c === 1) moveIn(s.x, s.y, 'jump');
      else if (s.c === 2) { recs.push(dstRecord(2, 2, 'jump'), dstRecord(-4, -4, 'jump'), dstRecord(2, 2, 'jump')); count += 3; }
      else if (s.c === 3) { recs.push(dstRecord(0, 0, 'color')); count++; colorCount++; }
      else if (s.c === 4) { recs.push(dstRecord(0, 0, 'end')); count++; }
    }
    const b = boundsU(U);
    const B = new Buf();
    const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
    const num = (v, n) => String(v).padStart(n, ' ');
    const sgn = v => (v >= 0 ? '+' : '-') + num(Math.abs(v), 5);
    B.ascii('LA:' + pad((name || 'Untitled').replace(/[^\x20-\x7e]/g, ''), 16) + '\r');
    B.ascii('ST:' + num(count, 7) + '\r');
    B.ascii('CO:' + num(colorCount, 3) + '\r');
    B.ascii('+X:' + num(Math.abs(b[2]), 5) + '\r');
    B.ascii('-X:' + num(Math.abs(b[0]), 5) + '\r');
    B.ascii('+Y:' + num(Math.abs(b[3]), 5) + '\r');
    B.ascii('-Y:' + num(Math.abs(b[1]), 5) + '\r');
    B.ascii('AX:' + sgn(px) + '\r');
    B.ascii('AY:' + sgn(-py) + '\r');
    B.ascii('MX:+    0\r'); B.ascii('MY:+    0\r'); B.ascii('PD:******\r');
    B.u8(0x1a);
    while (B.pos < 512) B.u8(0x20);
    recs.forEach(r => B.bytes(r));
    return B.out();
  };

  // VP3 (Husqvarna Viking / Pfaff) --------------------------------------
  function vp3Str16(B, s) { B.u16be(s.length * 2); B.utf16be(s); }
  function vp3Str8(B, s) { const e = new TextEncoder().encode(s); B.u16be(e.length); B.bytes(e); }
  function patchDistance(B, at) { B.patch32(at, B.pos - at - 4); }
  S.writeVP3 = function (design) {
    const U = toUnits(design);
    // split into colour blocks (the colour-change record stays at the start of the next block, as pyembroidery does)
    const blocks = [];
    let cur = [];
    for (const s of U) { if (s.c === 3) { blocks.push(cur); cur = [s]; } else cur.push(s); }
    blocks.push(cur);
    const ext = boundsU(U);
    const B = new Buf();
    B.ascii('%vsm%'); B.u8(0); vp3Str16(B, 'Produced by     Software Ltd');
    B.bytes([0, 2, 0]); const p020 = B.pos; B.i32be(0);
    vp3Str16(B, '');
    B.i32be(ext[2] * 100); B.i32be(ext[1] * -100); B.i32be(ext[0] * 100); B.i32be(ext[3] * -100);
    const ends = U.filter(s => s.c === 4).length;
    B.i32be(U.length - ends);
    B.u8(0); B.u8(blocks.length); B.u8(12); B.u8(0);
    B.u8(1); // one design
    // design block
    B.bytes([0, 3, 0]); const p030 = B.pos; B.i32be(0);
    const width = ext[2] - ext[0], height = ext[3] - ext[1];
    const hw = width / 2, hh = height / 2, cx = ext[2] - hw, cy = ext[3] - hh;
    B.i32be(Math.trunc(cx) * 100); B.i32be(Math.trunc(cy) * -100);
    B.u8(0); B.u8(0); B.u8(0);
    B.i32be(Math.trunc(hw) * -100); B.i32be(Math.trunc(hw) * 100); B.i32be(Math.trunc(hh) * -100); B.i32be(Math.trunc(hh) * 100);
    B.i32be(Math.trunc(width) * 100); B.i32be(Math.trunc(height) * 100);
    vp3Str16(B, '');
    B.bytes([0x64, 0x64]); B.i32be(4096); B.i32be(0); B.i32be(0); B.i32be(4096);
    B.ascii('xxPP'); B.bytes([1, 0]);
    vp3Str16(B, 'Produced by     Software Ltd');
    B.u16be(blocks.length);
    blocks.forEach((stitches, bi) => {
      const thread = design.colors[bi] || design.colors[design.colors.length - 1] || { color: '#000000', name: '' };
      B.bytes([0, 5, 0]); const p050 = B.pos; B.i32be(0);
      let fx = 0, fy = 0, lx = 0, ly = 0;
      if (stitches.length) { fx = stitches[0].x; fy = stitches[0].y; if (bi === 0) { fx = 0; fy = 0; } lx = stitches[stitches.length - 1].x; ly = stitches[stitches.length - 1].y; }
      B.i32be(Math.trunc(fx - cx) * 100); B.i32be(Math.trunc(-(fy - cy)) * 100);
      // thread
      const rgb = parseInt(thread.color.replace('#', ''), 16) || 0;
      B.bytes([1, 0]); B.u24be(rgb); B.bytes([0, 0, 0, 5, 0x28]);
      vp3Str8(B, ''); vp3Str8(B, thread.name || thread.color); vp3Str8(B, '');
      B.i32be(Math.trunc(lx - fx) * 100); B.i32be(Math.trunc(-(ly - fy)) * 100);
      // stitches
      B.bytes([0, 1, 0]); const p010 = B.pos; B.i32be(0);
      B.bytes([0x0a, 0xf6, 0x00]);
      let x0 = fx, y0 = fy;
      for (const s of stitches) {
        if (s.c === 4) { B.bytes([0x80, 0x03]); break; }
        if (s.c === 3 || s.c === 1) continue;
        if (s.c === 2) { B.bytes([0x80, 0x03]); continue; }
        const dx = s.x - x0, dy = s.y - y0; x0 += dx; y0 += dy;
        if (dx >= -127 && dx <= 127 && dy >= -127 && dy <= 127) { B.i8(dx); B.i8(dy); }
        else { B.bytes([0x80, 0x01]); B.u16be(dx & 0xffff); B.u16be(dy & 0xffff); B.bytes([0x80, 0x02]); }
      }
      patchDistance(B, p010);
      B.u8(0);
      patchDistance(B, p050);
    });
    patchDistance(B, p030);
    patchDistance(B, p020);
    return B.out();
  };

  // ---------- READERS -> {blocks:[{color, name, lines:[[[x,y],...]]}]} in mm, y down
  S.readVP3 = function (buf) {
    const d = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
    let p = 0;
    const u8 = () => d.getUint8(p++), u16 = () => { const v = d.getUint16(p); p += 2; return v; }, i32 = () => { const v = d.getInt32(p); p += 4; return v; }, u24 = () => (u8() << 16) | (u8() << 8) | u8();
    const skipStr = () => { const n = u16(); p += n; };
    const str8 = () => { const n = u16(); const s = new TextDecoder().decode(new Uint8Array(d.buffer, d.byteOffset + p, n)); p += n; return s; };
    if (String.fromCharCode(u8(), u8(), u8(), u8(), u8()) !== '%vsm%') throw new Error('Not a VP3 file');
    p = 6; skipStr(); p += 7; skipStr(); p += 32;
    const cx = i32() / 100, cy = -(i32() / 100);
    p += 27; skipStr(); p += 24; skipStr();
    const count = u16(), blocks = [];
    let x = 0, y = 0;
    for (let b = 0; b < count; b++) {
      p += 3; const dist = d.getUint32(p); p += 4; const end = p + dist;
      const sx = i32() / 100, sy = -(i32() / 100);
      const ax = sx + cx, ay = sy + cy;
      if (ax !== 0 && ay !== 0) { x = ax; y = ay; }
      const nc = u8(); u8(); let color = 0; for (let m = 0; m < nc; m++) { color = u24(); u8(); u16(); }
      u8(); u8(); str8(); const desc = str8(); str8();
      p += 15; p += 3;
      const lines = []; let line = [[x, y]], jump = false;
      const newAt = () => { if (line.length > 1) lines.push(line); line = [[x, y]]; };
      const sb = new Int8Array(d.buffer, d.byteOffset + p, Math.max(0, end - p));
      let i = 0;
      const s16 = (a2, b2) => { const v = ((a2 & 255) << 8) | (b2 & 255); return v > 0x7fff ? v - 0x10000 : v; };
      while (i < sb.length - 1) {
        let dx = sb[i], dy = sb[i + 1]; i += 2;
        if ((dx & 255) !== 0x80) { x += dx; y += dy; if (jump) { newAt(); jump = false; } else line.push([x, y]); continue; }
        if (dy === 1) { dx = s16(sb[i], sb[i + 1]); i += 2; dy = s16(sb[i], sb[i + 1]); i += 2; i += 2; x += dx; y += dy; newAt(); jump = false; }   // long move = jump (machine moves without sewing)
        else if (dy === 3) { newAt(); jump = true; }                                       // trim: next move is a jump
      }
      if (line.length > 1) lines.push(line);
      p = end;
      blocks.push({ color: '#' + color.toString(16).padStart(6, '0'), name: desc, lines: lines.map(l => l.map(q => [q[0] / 10, q[1] / 10])) });
    }
    return { blocks };
  };
  S.readDST = function (buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const DEF = ['#1f3a93', '#c8102e', '#f2a900', '#2e7d32', '#000000', '#ffffff', '#6a2c91', '#e35205'];
    let x = 0, y = 0; const blocks = []; let cur = { color: DEF[0], name: '', lines: [] }, line = [[0, 0]]; blocks.push(cur);
    const bit = (v, n) => (v >> n) & 1;
    let jumps = 0;
    for (let i = 512; i + 2 < b.length; i += 3) {
      const b0 = b[i], b1 = b[i + 1], b2 = b[i + 2];
      let dx = 0, dy = 0;
      dx += bit(b2, 2) * 81 - bit(b2, 3) * 81 + bit(b1, 2) * 27 - bit(b1, 3) * 27 + bit(b0, 2) * 9 - bit(b0, 3) * 9 + bit(b1, 0) * 3 - bit(b1, 1) * 3 + bit(b0, 0) - bit(b0, 1);
      dy += bit(b2, 5) * 81 - bit(b2, 4) * 81 + bit(b1, 5) * 27 - bit(b1, 4) * 27 + bit(b0, 5) * 9 - bit(b0, 4) * 9 + bit(b1, 7) * 3 - bit(b1, 6) * 3 + bit(b0, 7) - bit(b0, 6);
      dy = -dy;
      if ((b2 & 0b11110011) === 0b11110011) break;                       // end
      if ((b2 & 0b11000011) === 0b11000011) {                             // colour change
        if (line.length > 1) cur.lines.push(line);
        cur = { color: DEF[blocks.length % DEF.length], name: '', lines: [] }; blocks.push(cur); line = [[x, y]]; jumps = 0; continue;
      }
      x += dx; y += dy;
      if (b2 & 0x80) { jumps++; if (line.length > 1) cur.lines.push(line); line = [[x, y]]; continue; }   // jump (trims are runs of jumps)
      jumps = 0; line.push([x, y]);
    }
    if (line.length > 1) cur.lines.push(line);
    blocks.forEach(bl => bl.lines = bl.lines.map(l => l.map(q => [q[0] / 10, q[1] / 10])));
    return { blocks: blocks.filter(bl => bl.lines.length) };
  };

  root.Stitch = S;
})(typeof window !== 'undefined' ? window : globalThis);
