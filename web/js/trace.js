/* Stitch Studio — image tracing: colour reduction, cleanup, contour tracing. */
(function (root) {
  'use strict';
  const T = {};

  // k-means in RGB on a pixel sample. px: Uint8ClampedArray RGBA, mask: which pixels count
  T.kmeans = function (px, n, k, mask) {
    const idx = [];
    for (let i = 0; i < n; i++) if (!mask || mask[i]) idx.push(i);
    if (!idx.length) return [];
    const sample = [];
    const stepS = Math.max(1, Math.floor(idx.length / 20000));
    for (let i = 0; i < idx.length; i += stepS) { const j = idx[i] * 4; sample.push([px[j], px[j + 1], px[j + 2]]); }
    // k-means++ init
    const C = [sample[Math.floor(sample.length / 2)].slice()];
    while (C.length < k) {
      let best = null, bd = -1;
      for (let t = 0; t < sample.length; t += 7) {
        const s = sample[t];
        let d = Infinity;
        for (const c of C) d = Math.min(d, (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2);
        if (d > bd) { bd = d; best = s; }
      }
      if (!best || bd < 1) break;
      C.push(best.slice());
    }
    for (let it = 0; it < 12; it++) {
      const sum = C.map(() => [0, 0, 0, 0]);
      for (const s of sample) {
        let bi = 0, bd = Infinity;
        C.forEach((c, i) => { const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2; if (d < bd) { bd = d; bi = i; } });
        const a = sum[bi]; a[0] += s[0]; a[1] += s[1]; a[2] += s[2]; a[3]++;
      }
      C.forEach((c, i) => { const a = sum[i]; if (a[3]) { c[0] = a[0] / a[3]; c[1] = a[1] / a[3]; c[2] = a[2] / a[3]; } });
    }
    return C.map(c => c.map(v => Math.round(v)));
  };

  T.assign = function (px, n, C, mask) {
    const L = new Int16Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (mask && !mask[i]) continue;
      const j = i * 4; let bi = 0, bd = Infinity;
      for (let c = 0; c < C.length; c++) { const d = (px[j] - C[c][0]) ** 2 + (px[j + 1] - C[c][1]) ** 2 + (px[j + 2] - C[c][2]) ** 2; if (d < bd) { bd = d; bi = c; } }
      L[i] = bi;
    }
    return L;
  };

  // 3x3 majority filter, keeps -1 (background) fixed
  T.majority = function (L, w, h, K) {
    const out = new Int16Array(L);
    const cnt = new Int32Array(K);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (L[i] < 0) continue;
      cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = L[i + dy * w + dx]; if (v >= 0) cnt[v]++; }
      let bi = L[i], bc = cnt[bi];
      for (let k = 0; k < K; k++) if (cnt[k] > bc) { bc = cnt[k]; bi = k; }
      if (bc >= 5) out[i] = bi;
    }
    return out;
  };

  // connected components of value v (8-connected); returns label array and sizes
  T.components = function (L, w, h, v) {
    const lab = new Int32Array(w * h).fill(0);
    const sizes = [0];
    const stack = [];
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (L[i] !== v || lab[i]) continue;
      n++; let sz = 0; stack.push(i); lab[i] = n;
      while (stack.length) {
        const p = stack.pop(); sz++;
        const x = p % w, y = (p - x) / w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (L[q] === v && !lab[q]) { lab[q] = n; stack.push(q); }
        }
      }
      sizes.push(sz);
    }
    return { lab, sizes, n };
  };

  // absorb specks smaller than minArea into the surrounding colour
  T.despeckle = function (L, w, h, K, minArea) {
    for (let pass = 0; pass < 3; pass++) {
      let changed = 0;
      for (let v = 0; v < K; v++) {
        const { lab, sizes } = T.components(L, w, h, v);
        for (let i = 0; i < w * h; i++) {
          const c = lab[i]; if (!c || sizes[c] >= minArea) continue;
          // most common neighbour colour of this pixel (search outward)
          let found = -1;
          for (let r = 1; r < 12 && found < 0; r++) {
            const x = i % w, y = (i - x) / w;
            const tally = {};
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
              const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              const q = yy * w + xx; if (lab[q] === c) continue; const u = L[q]; if (u === v) continue;
              tally[u] = (tally[u] || 0) + 1;
            }
            let bc = 0; for (const u in tally) if (tally[u] > bc) { bc = tally[u]; found = +u; }
          }
          if (found !== -2) { L[i] = found; changed++; }
        }
      }
      if (!changed) break;
    }
    return L;
  };

  // marching squares on a binary mask -> closed loops in pixel coords
  T.contours = function (M, w, h) {
    const W = w + 2, H = h + 2;
    const g = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[(y + 1) * W + x + 1] = M[y * w + x] ? 1 : 0;
    const segs = new Map();
    const key = (x, y) => x * 4 + ',' + y * 4;   // points on half-pixel grid
    const add = (a, b) => { const ka = key(a[0], a[1]); if (!segs.has(ka)) segs.set(ka, []); segs.get(ka).push(b); };
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const tl = g[y * W + x], tr = g[y * W + x + 1], br = g[(y + 1) * W + x + 1], bl = g[(y + 1) * W + x];
      const c = tl * 8 + tr * 4 + br * 2 + bl;
      if (c === 0 || c === 15) continue;
      const T_ = [x + 0.5, y], R = [x + 1, y + 0.5], B = [x + 0.5, y + 1], Lf = [x, y + 0.5];
      // oriented so filled region is on the right
      switch (c) {
        case 1: add(Lf, B); break; case 2: add(B, R); break; case 3: add(Lf, R); break;
        case 4: add(R, T_); break; case 5: add(Lf, T_); add(R, B); break; case 6: add(B, T_); break;
        case 7: add(Lf, T_); break; case 8: add(T_, Lf); break; case 9: add(T_, B); break;
        case 10: add(T_, R); add(B, Lf); break; case 11: add(T_, R); break; case 12: add(R, Lf); break;
        case 13: add(R, B); break; case 14: add(B, Lf); break;
      }
    }
    const loops = [];
    for (const [k0, list0] of segs) {
      while (list0.length) {
        const start = k0.split(',').map(v => +v / 4);
        const loop = [start];
        let nxt = list0.pop();
        let guard = 0;
        while (guard++ < 1e6) {
          const k = key(nxt[0], nxt[1]);
          if (k === k0) break;
          loop.push(nxt);
          const l = segs.get(k);
          if (!l || !l.length) break;
          nxt = l.pop();
        }
        if (loop.length >= 4) loops.push(loop.map(p => [p[0] - 1, p[1] - 1]));
      }
    }
    return loops;
  };

  // Ramer–Douglas–Peucker for closed loops
  T.simplify = function (loop, eps) {
    if (loop.length < 8) return loop;
    const rdp = (pts) => {
      if (pts.length < 3) return pts;
      const a = pts[0], b = pts[pts.length - 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-9;
      let bi = -1, bd = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i]; const dd = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / d;
        if (dd > bd) { bd = dd; bi = i; }
      }
      if (bd <= eps) return [a, b];
      const l = rdp(pts.slice(0, bi + 1)), r = rdp(pts.slice(bi));
      return l.slice(0, -1).concat(r);
    };
    const half = Math.floor(loop.length / 2);
    const A = rdp(loop.slice(0, half + 1)), B = rdp(loop.slice(half).concat([loop[0]]));
    return A.slice(0, -1).concat(B.slice(0, -1));
  };

  T.area = function (loop) { let a = 0; for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

  // dilate a binary mask by r pixels (square)
  T.dilate = function (M, w, h, r) {
    const out = new Uint8Array(M.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!M[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
      }
    }
    return out;
  };

  root.Trace = T;
})(typeof window !== 'undefined' ? window : globalThis);
